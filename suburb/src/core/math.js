/*
 * math.js — the small pile of linear algebra this renderer uses.
 *
 * Column-major Float32Array everywhere, which is what WebGL wants, so matrices
 * go to uniformMatrix4fv with transpose=false and no copying.
 *
 * This is the same math as the sibling app in `backrooms/`, deliberately: the
 * two share a renderer lineage and a camera convention (yaw 0 looks down -Z,
 * yaw grows counter-clockwise seen from above), and two subtly different
 * versions of viewFromEuler in one repository would be a trap. What is new
 * here is the last section: this game is played outdoors in a bounded
 * neighbourhood, so it needs ray/box tests and angle arithmetic that an
 * endless indoor maze never did.
 */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
/* Frame-rate independent exponential approach. `rate` is roughly "how much of
 * the gap is closed per second"; the dt scaling keeps a 30fps machine from
 * feeling different to a 144fps one. */
export function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }

/* Shortest signed angle from a to b, in (-PI, PI]. Used everywhere the
 * whistler turns: a naive b - a makes her spin the long way round every time
 * the difference crosses PI, which reads as a glitch rather than as a turn. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function approachAngle(a, b, maxStep) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

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
 * Built directly rather than by composing and inverting — fewer ops, and no
 * chance of an inverse going singular on a degenerate up vector, which is the
 * classic lookAt failure when you stare straight up at a bedroom ceiling.
 */
export function viewFromEuler(out, px, py, pz, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  const rx = cy,       ry = 0,   rz = -sy;
  const ux = sy * sp,  uy = cp,  uz = cy * sp;
  const fx = sy * cp,  fy = -sp, fz = cy * cp;

  out[0] = rx; out[4] = ry; out[8]  = rz;  out[12] = -(rx * px + ry * py + rz * pz);
  out[1] = ux; out[5] = uy; out[9]  = uz;  out[13] = -(ux * px + uy * py + uz * pz);
  out[2] = fx; out[6] = fy; out[10] = fz;  out[14] = -(fx * px + fy * py + fz * pz);
  out[3] = 0;  out[7] = 0;  out[11] = 0;   out[15] = 1;
  return out;
}

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
 * Six frustum planes out of a view-projection matrix (Gribb/Hartmann). Normals
 * point inwards, so a point is inside when a*x + b*y + c*z + d >= 0.
 */
export function frustumFromMatrix(m, out) {
  const p = out || new Float32Array(24);
  for (let i = 0; i < 3; i++) {
    const s = i * 2;
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
    /* Positive vertex: the corner furthest along the plane normal. If even
     * that one is behind the plane, the whole box is out. */
    const x = a >= 0 ? maxX : minX;
    const y = b >= 0 ? maxY : minY;
    const z = c >= 0 ? maxZ : minZ;
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Rays and boxes
 *
 * Line of sight decides whether she has seen you, so it is the most
 * consequential arithmetic in the game and it is worth having exactly once,
 * here, rather than open-coded in the entity and again in the renderer.
 * ------------------------------------------------------------------ */

/*
 * Slab test for a segment against an axis-aligned box. Returns the entry
 * parameter in [0,1], or -1 for a miss.
 *
 * The 1/0 = Infinity path is deliberate and correct: a ray exactly parallel to
 * a slab produces ±Infinity bounds which compare the right way round, and
 * special-casing it with an epsilon is what introduces the classic bug where a
 * sight line that runs precisely along a wall passes through it.
 */
export function segmentBox(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0, tmax = 1;
  const invx = 1 / dx, invy = 1 / dy, invz = 1 / dz;

  let t1 = (box.x0 - ox) * invx, t2 = (box.x1 - ox) * invx;
  if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
  tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);

  t1 = (box.y0 - oy) * invy; t2 = (box.y1 - oy) * invy;
  if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
  tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);

  t1 = (box.z0 - oz) * invz; t2 = (box.z1 - oz) * invz;
  if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
  tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);

  return tmax >= tmin ? tmin : -1;
}

/* Distance from a point to a segment in the XZ plane. The whistler's hearing
 * uses it: a noise made while you were walking is a line, not a point. */
export function pointSegment2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? clamp(((px - ax) * vx + (pz - az) * vz) / len2, 0, 1) : 0;
  const cx = ax + vx * t, cz = az + vz * t;
  return Math.hypot(px - cx, pz - cz);
}
