/*
 * body.js — everything of the customer that is not the head: neck, shoulders,
 * the top they came in wearing, ears, and hair.
 *
 * The camera never leaves the counter, so this is a bust and not a body. What
 * it has to do is carry the head convincingly — a head that ends at the jaw
 * looks like a mask on a stick, and the neck's shadow under the chin is doing
 * as much work for the face as anything on the face itself.
 *
 * All of it is in the head's units and the head's frame, so the whole customer
 * moves under one model matrix.
 */

import { MeshBuilder, sphere, lathe } from './mesh.js';
import { surfaceFrame, NEUTRAL_EXPR } from './head.js';
import { sampleS, F } from './face.js';
import { clamp, smoothstep, compose, mat4 } from '../core/math.js';

const TAU = Math.PI * 2;

/*
 * A swept surface through elliptical rings. Circular lathes cannot describe a
 * neck that runs into a pair of shoulders — the cross-section has to go from
 * nearly round to twice as wide as it is deep — and that transition is the
 * whole silhouette of a bust.
 */
function sweep(b, rings, seg, opts = {}) {
  const rows = [];
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const row = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      /* The normal of an ellipse is not its radius vector — but this mesh has
       * its normals recomputed from the triangles afterwards, so the radial
       * one here is only a placeholder and is deliberately not laboured. */
      let nx = ca / ring.rx, nz = sa / ring.rz;
      const sc = Math.hypot(nx, nz) || 1;
      row.push(b.vert(ca * ring.rx, ring.y, sa * ring.rz + (ring.cz || 0),
        nx / sc, 0, nz / sc,
        (i / seg) * (opts.uRepeat || 2), ring.y * (opts.vScale || 0.5),
        ring.ao === undefined ? 1 : ring.ao));
    }
    rows.push(row);
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      b.quad(rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i]);
    }
  }
  return rows;
}

/*
 * Neck and the top of the chest, in skin. It starts inside the head so there is
 * never a gap under the jaw at any camera angle, and the ambient occlusion
 * ramps up towards the top for the shadow the jaw casts.
 */
export function buildNeck(P) {
  const b = new MeshBuilder();
  const w = P.width;
  /* A neck is about half as wide as the head it carries — 0.31 of a head
   * half-height, which is what this was, is a stalk. */
  sweep(b, [
    { y: -0.42, rx: 0.40 * w, rz: 0.35, cz: -0.06, ao: 0.52 },
    { y: -0.75, rx: 0.41 * w, rz: 0.36, cz: -0.05, ao: 0.62 },
    { y: -1.10, rx: 0.43 * w, rz: 0.37, cz: -0.04, ao: 0.80 },
    { y: -1.45, rx: 0.47 * w, rz: 0.40, cz: -0.02, ao: 0.92 },
    { y: -1.70, rx: 0.58 * w, rz: 0.44, cz: 0.00, ao: 0.95 },
    { y: -1.92, rx: 0.78 * w, rz: 0.44, cz: 0.02, ao: 1 },
    { y: -2.15, rx: 1.08 * w, rz: 0.52, cz: 0.02, ao: 1 },
    { y: -2.45, rx: 1.22 * w, rz: 0.56, cz: 0.02, ao: 0.95 },
    { y: -2.95, rx: 1.24 * w, rz: 0.58, cz: 0.02, ao: 0.8 },
  ], 40, { uRepeat: 3, vScale: 0.4 });
  b.computeNormals();
  return b.build();
}

/*
 * The top. A separate mesh from the neck because it is a separate material —
 * fabric, not skin — and because its neckline is the one silhouette that says
 * what kind of appointment this is.
 *
 * The neckline is cut per-angle rather than as a flat ring: a scoop at the
 * front, higher at the back, which is how any garment actually sits.
 */
export function buildGarment(P, style = 0) {
  const b = new MeshBuilder();
  const seg = 44, rows = 9;
  const w = P.width;
  const scoop = [0.30, 0.16, 0.44][style % 3];
  const grid = [];

  for (let r = 0; r <= rows; r++) {
    const k = r / rows;
    const row = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const front = Math.max(0, sa);
      const yTop = -1.86 - scoop * front * front;
      const y = yTop + (-3.1 - yTop) * k;
      /* Widen from the shoulder line down, then hold. */
      const g = smoothstep(-1.9, -2.3, y);
      const rx = (0.80 + 0.46 * g) * w;
      const rz = 0.45 + 0.14 * g;
      let nx = ca / rx, nz = sa / rz;
      const sc = Math.hypot(nx, nz) || 1;
      /* The fabric lifts away from the body slightly at the neckline, which is
       * what stops the collar looking painted on. */
      const lift = 0.035 * (1 - smoothstep(0, 0.22, k));
      row.push(b.vert(
        ca * rx + (nx / sc) * lift,
        y,
        sa * rz + 0.02 + (nz / sc) * lift,
        nx / sc, 0.15 * (1 - k), nz / sc,
        (i / seg) * 4, k * 2.2,
        clamp(0.55 + 0.45 * k + 0.3 * front, 0, 1)));
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < seg; i++) {
      b.quad(grid[r][i], grid[r][i + 1], grid[r + 1][i + 1], grid[r + 1][i]);
    }
  }
  b.computeNormals();
  return b.build();
}

/* Ears. Small, mostly covered, and immediately missed when they are absent on
 * a customer whose hair is up. */
export function buildEars(P) {
  const b = new MeshBuilder();
  for (const side of [-1, 1]) {
    const { p, n } = surfaceFrame(P, 0.5 + side * 0.345, 0.400, NEUTRAL_EXPR);
    const outer = new MeshBuilder();
    sphere(outer, 0, 0, 0, 1, [16, 12], { ao: 0.9 });
    const m = mat4();
    compose(m, p[0] + n[0] * 0.012, p[1], p[2] + n[2] * 0.012,
      0, 0, side * 0.18, 0.035, 0.115, 0.075);
    b.append(outer, m);

    const inner = new MeshBuilder();
    sphere(inner, 0, 0, 0, 1, [12, 10], { ao: 0.45 });
    const m2 = mat4();
    compose(m2, p[0] + n[0] * 0.030, p[1] - 0.01, p[2] + n[2] * 0.030 - 0.012,
      0, 0, side * 0.18, 0.020, 0.070, 0.045);
    b.append(inner, m2);
  }
  return b.build();
}

/* ------------------------------------------------------------------ *
 * Hair
 * ------------------------------------------------------------------ */

/*
 * `volume` is how far the hair stands off the scalp, in head half-heights. A
 * real head of hair adds 15 to 25mm, which is 0.13 to 0.22 here; the first
 * version of this table used a twentieth of that and produced a shell so thin
 * that every customer read as bald with a dark outline.
 */
export const HAIR_STYLES = {
  loose: { edge: 0.44, fall: 2.05, volume: 0.150, peak: 0.020, wave: 1.0 },
  bob: { edge: 0.42, fall: 0.95, volume: 0.145, peak: 0.010, wave: 0.5 },
  crop: { edge: 0.40, fall: 0.16, volume: 0.095, peak: 0.024, wave: 0.3 },
  bun: { edge: 0.36, fall: 0.10, volume: 0.080, peak: 0.014, wave: 0.15, bun: true },
  pony: { edge: 0.37, fall: 0.12, volume: 0.090, peak: 0.018, wave: 0.2, tail: true },
};

export const HAIR_STYLE_NAMES = Object.keys(HAIR_STYLES);

/* How many locks the fall is broken into. Twelve or so is what a head of hair
 * separates into on its own; the mesh has 108 columns, so each lock still gets
 * eight of them to be a shape with. */
export const LOCKS = 13;

/*
 * Where the hairline sits, as a function of the angle round the head. Front is
 * high on the forehead, it drops fast past the temples, and at the back it is
 * halfway down the skull. The optional widow's peak is a dip at dead centre.
 */
function hairEdge(style, s) {
  const a = Math.abs(s - 0.5);
  const base = 0.152 + (style.edge - 0.152 + 0.12) * Math.pow(smoothstep(0.045, 0.47, a), 1.05);
  return base + style.peak * Math.exp(-((a / 0.080) ** 2));
}

/*
 * No hair falls over the front of the face; it starts past the temples.
 *
 * Which is to say past the outer corner of the eye, and that is where it is
 * measured from rather than from a constant of its own: when the eyes moved
 * outward in face space the fall stayed where it was, and every customer
 * arrived with her hair hanging over the corner of both eyes.
 */
const TEMPLE_S = F.eyeS + F.eyeHalfS + 0.010;

function fallAmount(s) {
  return smoothstep(TEMPLE_S, TEMPLE_S + 0.100, Math.abs(s - 0.5));
}

/*
 * Locks.
 *
 * Hair does not hang as one sheet. It hangs in a dozen or so ropes that stand
 * proud of each other, shadow each other and end at different heights. Without
 * them the fall is a single ruled surface, and no texture put on a single ruled
 * surface reads as hair — it reads as a curtain, which is exactly what every
 * customer had on her head.
 *
 * Both numbers are smooth in `s`. A lock boundary that jumped would stretch the
 * quads across it into long spikes rather than separating them, because the
 * fall is one connected sheet and always will be.
 */
function hairLocks(s, wobble) {
  const a = s * LOCKS + wobble * 0.11;
  const f = a - Math.floor(a);
  /* Standing proud in the middle of a lock, tucked in where two meet. */
  const ridge = Math.pow(Math.sin(f * Math.PI), 1.4);
  /* And a slower beat over the top so they do not all end level. */
  const vary = 0.5 + 0.5 * Math.sin(a * 1.7 + wobble) * Math.sin(a * 0.63 + wobble * 1.7);
  return { ridge, vary };
}

/*
 * The hair is the head's own surface, pushed out along its normal and cut at
 * the hairline — which is why it fits every customer's skull without a single
 * per-face adjustment — plus a fall that leaves the head at the cut edge and
 * hangs.
 */
export function buildHair(P, styleName, rng) {
  const style = HAIR_STYLES[styleName] || HAIR_STYLES.loose;
  const b = new MeshBuilder();
  const NS = 108, NK = 16, NF = 20;
  const wobble = rng ? rng.range(0, 100) : 0;

  const capRows = [];
  for (let k = 0; k <= NK; k++) {
    const kk = k / NK;
    const row = [];
    /*
     * t = 0 is the crown, and the crown is a pole: every column of the cap
     * lands on the same point there. They were each given their own vertex with
     * its own texture coordinate, so the strand texture fanned out from the top
     * of the head like a pinwheel — visible on every customer with a parting.
     * One vertex, shared, and the fan closes.
     */
    if (k === 0) {
      const { p, n } = surfaceFrame(P, 0.5, 0, NEUTRAL_EXPR);
      const off = style.volume * 0.30;
      const apex = b.vert(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off,
        n[0], n[1], n[2], 0, 0, 1);
      for (let i = 0; i <= NS; i++) row.push(apex);
      capRows.push(row);
      continue;
    }
    for (let i = 0; i <= NS; i++) {
      const s = sampleS(i, NS);
      const tEdge = hairEdge(style, s);
      const t = tEdge * kk;
      const { p, n } = surfaceFrame(P, s, t, NEUTRAL_EXPR);
      /*
       * Thickest over the crown. It thins to nothing at the cut across the
       * forehead, where the hair has to meet skin — but not at the sides and
       * back, where the cut is not an edge at all, it is where the fall starts.
       * Thinning there took the cap down to a third of its depth and the fall
       * began at nine tenths of it, so there was a hard shoulder running right
       * round the head and every style read as a cap with a brim on it.
       */
      const meet = 1 - fallAmount(s);
      const shape = 1 - meet * (1 - Math.sin(Math.PI * Math.pow(kk, 0.62)));
      const thick = style.volume * (0.30 + 0.70 * shape);
      const w = 1 + 0.10 * style.wave
        * Math.sin(s * 26 + wobble) * Math.sin(kk * 4.5 + wobble * 0.7);
      const off = thick * w;
      row.push(b.vert(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off,
        n[0], n[1], n[2], s * 5, kk * 1.4,
        clamp(0.45 + 0.55 * (1 - kk), 0, 1)));
    }
    capRows.push(row);
  }
  for (let k = 0; k < NK; k++) {
    for (let i = 0; i < NS; i++) {
      if (k === 0) b.tri(capRows[0][0], capRows[1][i], capRows[1][i + 1]);
      else b.quad(capRows[k][i], capRows[k + 1][i], capRows[k + 1][i + 1], capRows[k][i + 1]);
    }
  }

  /* The fall. Each column leaves the cap at its own cut point and drops, with a
   * slight outward bow and a taper at the ends. */
  if (style.fall > 0.2) {
    const fallRows = [capRows[NK]];
    for (let j = 1; j <= NF; j++) {
      const f = j / NF;
      const row = [];
      for (let i = 0; i <= NS; i++) {
        const s = sampleS(i, NS);
        const amt = fallAmount(s);
        const tEdge = hairEdge(style, s);
        const { p, n } = surfaceFrame(P, s, tEdge, NEUTRAL_EXPR);
        const len = style.fall * amt * (0.74 + 0.42 * hairLocks(s, wobble).vary);
        /* Bow out at the shoulder then draw back in: hair is widest about
         * two-thirds of the way down, not at the ends. */
        /* Hair is widest a little below the ear, but only a little: this used
         * to bow out by twenty-five millimetres and the result was a mushroom
         * with the face underneath it. */
        const bow = Math.sin(Math.PI * Math.min(1, f * 0.85)) * 0.055 * (0.4 + amt);
        const taper = 1 - 0.30 * f * f;
        const wave = style.wave * 0.055 * Math.sin(f * 5.5 + s * 19 + wobble);
        const lock = hairLocks(s, wobble);
        /* The locks separate as they fall: level with the scalp at the cut,
         * standing well apart by the ends. */
        /*
         * Everything the fall does is scaled by how much fall there is, so
         * where there is none — across the front of the face — the rows sit
         * exactly on the cap's edge and collapse. Without that they stood off
         * it by the fall's full depth while having no length at all, and each
         * temple grew a flat triangular flap that stuck out sideways.
         */
        const off = style.volume * 0.30 + amt * (style.volume * (0.9 * taper - 0.30) + bow
          + lock.ridge * style.volume * 0.85 * smoothstep(0, 0.55, f));
        row.push(b.vert(
          (p[0] + n[0] * off) * (1 + wave * 0.4),
          p[1] - len * f + wave * 0.3 * amt,
          (p[2] + n[2] * off) - f * 0.06 * amt,
          n[0], n[1] * 0.3, n[2],
          s * 5, 1.4 + f * 2.6,
          clamp(0.85 - 0.25 * (1 - f), 0, 1)));
      }
      fallRows.push(row);
    }
    for (let j = 0; j < fallRows.length - 1; j++) {
      for (let i = 0; i < NS; i++) {
        b.quad(fallRows[j][i], fallRows[j + 1][i], fallRows[j + 1][i + 1], fallRows[j][i + 1]);
      }
    }
  }

  if (style.bun) {
    const { p, n } = surfaceFrame(P, 0.0, 0.30, NEUTRAL_EXPR);
    const bun = new MeshBuilder();
    sphere(bun, 0, 0, 0, 1, [24, 18], { ao: 0.8 });
    const m = mat4();
    compose(m, p[0] + n[0] * 0.16, p[1] + 0.06, p[2] + n[2] * 0.16,
      0.2, 0, 0, 0.30, 0.26, 0.30);
    b.append(bun, m);
  }

  if (style.tail) {
    const { p, n } = surfaceFrame(P, 0.0, 0.32, NEUTRAL_EXPR);
    const tail = new MeshBuilder();
    lathe(tail, [
      [0.02, 0], [0.11, -0.10], [0.14, -0.45], [0.12, -0.95],
      [0.09, -1.35], [0.05, -1.62], [0.01, -1.72],
    ], 18, 0, 0, 0, { uvScale: 0.5, ao: 0.85 });
    const m = mat4();
    compose(m, p[0] + n[0] * 0.10, p[1] + 0.02, p[2] + n[2] * 0.10,
      -0.22, 0, 0, 1, 1, 1);
    b.append(tail, m);
  }

  b.computeNormals();
  return b.build();
}

/*
 * The customer's hands, resting on the counter. Two rounded shapes and no
 * fingers — at this framing they are a colour and a silhouette below the
 * shoulders, and anything more detailed draws the eye away from the face,
 * which is the only thing in the scene the player is meant to be looking at.
 */
export function buildHands(P) {
  const b = new MeshBuilder();
  for (const side of [-1, 1]) {
    const hand = new MeshBuilder();
    sphere(hand, 0, 0, 0, 1, [16, 12], { ao: 0.85 });
    const m = mat4();
    compose(m, side * 1.05 * P.width, -3.05, 0.95, -0.25, side * 0.3, 0,
      0.20, 0.12, 0.34);
    b.append(hand, m);
  }
  return b.build();
}
