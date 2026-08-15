/*
 * face.js — face space: the one coordinate system the head, its textures, its
 * masks and its scoring all agree on.
 *
 * The head is a deformed sphere, so the obvious texture layout is the sphere's
 * own longitude/latitude. That layout is unusable for a game about painting a
 * face: the whole face occupies about a tenth of it, and the lips come out
 * twenty pixels wide. There is nowhere to put a lipstick.
 *
 * So the mesh is not built on a uniform grid of sphere angles. It is built on a
 * uniform grid of *texture* coordinates (s, t), and each one is mapped through
 * a warp to the sphere angle it stands for. The warp spends texture area where
 * a person looks — the front of the face, and within it the band from brow to
 * chin — and takes it back from the top of the skull and under the jaw. The
 * lips end up roughly 290 x 90 texels instead of 20 x 8, and, as a free
 * consequence of the grid being uniform in (s, t), the mesh also has its
 * triangles where the features are.
 *
 * Everything downstream is defined in (s, t): where the eyes are, which texels
 * are lips, where a blusher should land. Which means the layout is fixed across
 * every customer, and a customer's face shape can vary as much as it likes —
 * longer jaw, wider nose, fuller lips — without moving a single mask, because
 * shape is a displacement applied *at* an (s, t), never a change to what that
 * (s, t) means.
 *
 * Reading the numbers below: s = 0.5 is the centre line of the face, s < 0.5 is
 * the side of the face that appears on the viewer's left, and t runs from the
 * crown at 0 to the underside of the neck at 1.
 */

import { clamp, smoothstep } from '../core/math.js';

/* ------------------------------------------------------------------ *
 * The warps
 * ------------------------------------------------------------------ */

/*
 * Longitude. `d` is the signed distance from the centre line; raising it to a
 * power greater than one means a small step in texture space is an even smaller
 * step in longitude near the nose, and a large one out by the ear.
 *
 * 1.82 was picked by working backwards from the lips: it is the exponent that
 * makes a mouth 50mm wide come out 28% of the texture across.
 */
const U_POWER = 1.82;

export function faceU(s) {
  const d = 2 * (s - 0.5);
  return 0.5 + 0.5 * Math.sign(d) * Math.pow(Math.abs(d), U_POWER);
}

/*
 * Latitude, as a monotone curve through control points. Slope below one means
 * that band is magnified in the texture; above one, compressed. The face band
 * runs at about 0.6, so it takes up a bit over half again the room it would
 * have had, and the crown and the underside of the jaw pay for it.
 */
const V_CONTROL_T = [0.00, 0.16, 0.33, 0.50, 0.72, 0.90, 1.00];
const V_CONTROL_V = [0.00, 0.28, 0.4333, 0.5667, 0.70, 0.78, 1.00];

/*
 * A monotone cubic through control points, Fritsch-Carlson.
 *
 * Monotonicity here is a correctness property, not a smoothness preference. A
 * plain Catmull-Rom through these points overshoots between the last two and
 * the map stops being monotone, which folds the mesh under the chin — every
 * triangle in a band inside out, and a black ring where the neck should be.
 *
 * Exported because the portrait side needs exactly the same thing: fitting a
 * photograph into face space is a monotone map through a handful of landmarks,
 * and two implementations of "a curve that never goes backwards" is one more
 * than anybody should maintain.
 */
export function monotoneMap(xs, ys) {
  const n = xs.length;
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  }
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }

  return (x) => {
    /* Outside the control points the curve continues on the end slope rather
     * than clamping: a landmark map has to keep going past the chin and past
     * the ear, and a flat extension there puts every zone in the wrong place
     * at the edges of the face. */
    if (x <= xs[0]) return ys[0] + (x - xs[0]) * m[0];
    if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * m[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const hh = xs[i + 1] - xs[i];
    const u = (x - xs[i]) / hh;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i]
      + (u3 - 2 * u2 + u) * hh * m[i]
      + (-2 * u3 + 3 * u2) * ys[i + 1]
      + (u3 - u2) * hh * m[i + 1];
  };
}

const V_MAP = monotoneMap(V_CONTROL_T, V_CONTROL_V);

export function faceV(t) {
  return V_MAP(clamp(t, 0, 1));
}

/* ------------------------------------------------------------------ *
 * Landmarks
 *
 * All in texture space. Changing one of these moves the feature on the mesh,
 * in the skin texture, and in the mask it is scored against, together — which
 * is the entire point of the module.
 * ------------------------------------------------------------------ */

export const F = {
  hairline: 0.160,
  browT: 0.305,        /* centre of the brow */
  creaseT: 0.335,      /* top of the eyeshadow area */
  eyeT: 0.385,         /* centre of the eyeball */
  lidTopT: 0.368,      /* upper lash line */
  lidBotT: 0.402,      /* lower lash line */
  underEyeT: 0.424,
  noseTipT: 0.492,
  noseBaseT: 0.525,
  mouthT: 0.580,       /* the line between the lips */
  chinT: 0.715,
  jawT: 0.860,

  /*
   * Horizontal landmarks.
   *
   * A warning to anybody adding one: `s` is NOT proportional to width on the
   * face. The longitude warp compresses hard towards the centre line, so a
   * feature 10mm from the middle of the nose is about 0.09 in s, while a
   * feature 10mm further out at the cheekbone is worth barely a third of that.
   * Sizing anything near the centre by eye gives a value three or four times
   * too small — the nose was first written with a half-width of 0.048, which is
   * a 4mm nose, and it was completely invisible on the rendered head while
   * every check still passed.
   */
  eyeS: 0.156,         /* offset from centre to eye centre */
  eyeHalfS: 0.045,
  browS: 0.163,
  browHalfS: 0.088,
  cheekS: 0.205,
  contourS: 0.290,
  lipHalfS: 0.141,
  noseHalfS: 0.105,    /* the wings; the bridge is about 0.09 */
  nostrilS: 0.079,
};

/* ------------------------------------------------------------------ *
 * Field helpers
 *
 * Every mask below is built out of these, so a zone is a formula rather than a
 * hand-drawn bitmap — which is why a mask can be regenerated at any resolution
 * and why the audit can assert things about it.
 * ------------------------------------------------------------------ */

/* Soft-edged ellipse. Returns 1 well inside, 0 well outside. */
export function ellipse(s, t, cs, ct, rs, rt, soft = 0.25) {
  const d = Math.hypot((s - cs) / rs, (t - ct) / rt);
  return 1 - smoothstep(1 - soft, 1, d);
}

/* The same ellipse mirrored about the centre line, which is what nearly every
 * feature is: two eyes, two brows, two cheeks. */
export function pair(s, t, ds, ct, rs, rt, soft = 0.25) {
  return Math.max(
    ellipse(s, t, 0.5 - ds, ct, rs, rt, soft),
    ellipse(s, t, 0.5 + ds, ct, rs, rt, soft));
}

/* Horizontal profile of a mouth-shaped region: 1 at the centre, falling to 0
 * at the corners, with the squareness of a lip rather than a circle. */
function lipProfile(x) {
  const a = Math.abs(x);
  if (a >= 1) return 0;
  return Math.pow(1 - a * a, 0.42);
}

/*
 * The lips, as the two lobes they are. The upper lobe carries a cupid's bow —
 * two peaks either side of a dip — because that shape is what the eye reads as
 * "lips" from any distance, and an ellipse reads as a bruise.
 */
export function lipMask(s, t) {
  const x = (s - 0.5) / F.lipHalfS;
  const w = lipProfile(x);
  if (w <= 0) return 0;

  const bow = 0.72 + 0.42 * Math.exp(-(((Math.abs(x) - 0.30) / 0.22) ** 2))
                   - 0.34 * Math.exp(-((x / 0.16) ** 2));
  const top = F.mouthT - 0.040 * w * bow;
  const bottom = F.mouthT + 0.055 * Math.pow(w, 0.8);
  const soft = 0.009;
  return smoothstep(top - soft, top + soft, t) * (1 - smoothstep(bottom - soft, bottom + soft, t));
}

/* The upper lobe alone, used by the skin texture to darken the vermilion edge
 * and by gloss to catch the light on the lower lip only. */
export function lipLower(s, t) {
  return lipMask(s, t) * smoothstep(F.mouthT - 0.004, F.mouthT + 0.012, t);
}

/*
 * A brow: an arc, not an ellipse. It rises from the inner end, peaks about two
 * thirds of the way out and drops towards the tail.
 */
export function browMask(s, t) {
  const side = s < 0.5 ? -1 : 1;
  const x = (s - (0.5 + side * F.browS)) / F.browHalfS;
  if (Math.abs(x) >= 1) return 0;
  const along = side > 0 ? x : -x;                       /* -1 inner, +1 outer */
  const arch = F.browT - 0.020 * smoothstep(-1, 0.35, along) * (1 - smoothstep(0.35, 1, along) * 0.55);
  const thick = 0.016 * (1 - 0.45 * smoothstep(0.3, 1, along)) * lipProfile(x);
  return 1 - smoothstep(thick * 0.55, thick, Math.abs(t - arch));
}

/* The eye opening — the part of the face there is no skin on. Foundation, and
 * everything else, has to stay out of it. */
export function eyeOpening(s, t) {
  const side = s < 0.5 ? -1 : 1;
  const x = (s - (0.5 + side * F.eyeS)) / F.eyeHalfS;
  if (Math.abs(x) >= 1) return 0;
  const w = lipProfile(x);
  const half = 0.017 * w;
  const c = (F.lidTopT + F.lidBotT) / 2;
  return 1 - smoothstep(half * 0.6, half, Math.abs(t - c));
}

/* ------------------------------------------------------------------ *
 * Zones
 *
 * The named areas a product can be applied to and scored on. Each is a
 * function of (s, t) returning coverage 0..1. `skin` is the union of
 * everything a brush is allowed to touch and doubles as the foundation area.
 * ------------------------------------------------------------------ */

export const ZONES = {
  /* The whole front of the face. Rolls off towards the ears and under the jaw
   * so foundation fades out rather than stopping at a line. */
  skin: (s, t) => {
    const face = ellipse(s, t, 0.5, 0.50, 0.46, 0.40, 0.45);
    return clamp(face * (1 - eyeOpening(s, t)), 0, 1);
  },

  cheek: (s, t) => pair(s, t, F.cheekS, 0.545, 0.115, 0.062, 0.75),

  contour: (s, t) => Math.max(
    pair(s, t, F.contourS, 0.520, 0.085, 0.075, 0.8),
    pair(s, t, 0.245, 0.640, 0.075, 0.055, 0.85)),

  lid: (s, t) => pair(s, t, F.eyeS, F.creaseT + 0.012, 0.078, 0.036, 0.7)
    * (1 - eyeOpening(s, t)),

  lash: (s, t) => {
    const side = s < 0.5 ? -1 : 1;
    const x = (s - (0.5 + side * F.eyeS)) / (F.eyeHalfS * 1.02);
    if (Math.abs(x) >= 1) return 0;
    const w = lipProfile(x);
    const line = F.lidTopT - 0.017 * w + 0.017;
    return (1 - smoothstep(0.004, 0.012, Math.abs(t - line))) * w;
  },

  brow: browMask,

  lip: lipMask,

  underEye: (s, t) => pair(s, t, F.eyeS * 0.94, F.underEyeT, 0.062, 0.026, 0.8),

  /* Where light is meant to sit: the bridge of the nose, the tops of the
   * cheekbones, the bow of the lip and the middle of the chin. */
  glow: (s, t) => Math.max(
    ellipse(s, t, 0.5, 0.430, 0.075, 0.085, 0.9),
    pair(s, t, 0.255, 0.505, 0.070, 0.040, 0.9),
    ellipse(s, t, 0.5, F.mouthT - 0.048, 0.045, 0.014, 0.9),
    ellipse(s, t, 0.5, 0.700, 0.055, 0.030, 0.9)),
};

export const ZONE_NAMES = Object.keys(ZONES);

/* ------------------------------------------------------------------ *
 * Masks
 * ------------------------------------------------------------------ */

/*
 * Rasterise every zone once at boot. They do not depend on the customer — that
 * is the whole payoff of fixing the layout — so this runs once for the session
 * and every stroke afterwards is a lookup.
 *
 * 512 is deliberate and lower than the paint resolution. The masks are smooth
 * fields with no detail at a texel's scale; the paint they clip is not.
 */
export function buildMasks(size = 512) {
  const zones = {};
  for (const name of ZONE_NAMES) {
    const fn = ZONES[name];
    const buf = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      const t = (y + 0.5) / size;
      for (let x = 0; x < size; x++) {
        const s = (x + 0.5) / size;
        buf[y * size + x] = Math.round(clamp(fn(s, t), 0, 1) * 255);
      }
    }
    zones[name] = buf;
  }
  return { size, zones };
}

/* Bilinear lookup, because a stroke reads the mask at paint resolution and a
 * nearest-neighbour read makes a lipstick's edge step in 2-texel stairs. */
export function sampleMask(masks, name, s, t) {
  const buf = masks.zones[name];
  if (!buf) return 0;
  const n = masks.size;
  const fx = clamp(s * n - 0.5, 0, n - 1.001);
  const fy = clamp(t * n - 0.5, 0, n - 1.001);
  const x0 = fx | 0, y0 = fy | 0;
  const ax = fx - x0, ay = fy - y0;
  const i = y0 * n + x0;
  const a = buf[i], b = buf[i + 1];
  const c = buf[i + n], d = buf[i + n + 1];
  return ((a + (b - a) * ax) * (1 - ay) + (c + (d - c) * ax) * ay) / 255;
}

/* Total mask weight, precomputed so "how much of the lips are covered" is a
 * ratio against the same denominator every time. */
export function maskTotal(masks, name) {
  const buf = masks.zones[name];
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return sum / 255;
}
