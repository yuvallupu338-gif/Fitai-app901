/*
 * color.js — the colour science the game scores on.
 *
 * A makeup game lives or dies on whether "that shade is too orange for her"
 * agrees with what the player can see. Comparing sRGB bytes does not agree:
 * two swatches eight units apart in blue are indistinguishable, and two
 * swatches eight units apart in green are a different product. So the match is
 * measured in CIE L*a*b*, where distance is roughly perceptual, and the
 * foundation check reports the two things a person at a counter actually says
 * — it is too light or too dark (L*), and it is too warm or too cool (the
 * hue angle of a*b*).
 *
 * Everything blends in linear light, because layering a sheer gloss over a
 * matte lipstick in gamma space produces the muddy grey that gives away a
 * renderer that never left sRGB.
 */

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/* "#rrggbb" -> [r,g,b] in 0..1 sRGB. Throws rather than returning black: a
 * typo in the product catalog should stop the audit, not ship a black
 * lipstick that looks deliberate. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bad colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb) {
  const b = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return '#' + ((b(rgb[0]) << 16) | (b(rgb[1]) << 8) | b(rgb[2]))
    .toString(16).padStart(6, '0');
}

/* sRGB (0..1) -> CIE XYZ, D65. */
function rgbToXyz(rgb) {
  const r = srgbToLinear(rgb[0]), g = srgbToLinear(rgb[1]), b = srgbToLinear(rgb[2]);
  return [
    r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  ];
}

const WHITE = [0.95047, 1.0, 1.08883];

export function rgbToLab(rgb) {
  const xyz = rgbToXyz(rgb);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116);
  const fx = f(xyz[0] / WHITE[0]);
  const fy = f(xyz[1] / WHITE[1]);
  const fz = f(xyz[2] / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/*
 * CIE94, graphic-arts weights. Plain CIE76 over-punishes saturated colours,
 * which here means a bold red lipstick one shade off scores worse than a nude
 * that is completely wrong — the exact inversion a player would call unfair.
 * The extra terms cost four lines.
 */
export function deltaE(rgbA, rgbB) {
  const a = rgbToLab(rgbA), b = rgbToLab(rgbB);
  const dL = a[0] - b[0];
  const c1 = Math.hypot(a[1], a[2]);
  const c2 = Math.hypot(b[1], b[2]);
  const dC = c1 - c2;
  const da = a[1] - b[1], db = a[2] - b[2];
  const dH2 = Math.max(0, da * da + db * db - dC * dC);
  const sC = 1 + 0.045 * c1;
  const sH = 1 + 0.015 * c1;
  return Math.sqrt(dL * dL + (dC / sC) ** 2 + dH2 / (sH * sH));
}

/*
 * How a foundation misses, in the words a person would use. `depth` is
 * positive when the product is lighter than the skin, `warmth` positive when
 * it is warmer (more orange/yellow), both in L*a*b* units so the thresholds
 * downstream mean something fixed.
 */
export function shadeMiss(product, skin) {
  const p = rgbToLab(product), s = rgbToLab(skin);
  const hueP = Math.atan2(p[2], p[1]);
  const hueS = Math.atan2(s[2], s[1]);
  let dh = hueP - hueS;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  return {
    depth: p[0] - s[0],
    /* In Lab the hue angle runs from red at the bottom towards yellow as it
     * grows, so a product with the larger angle is the warmer one. Scaled by
     * chroma, so a near-grey product is not reported as wildly warm on the
     * strength of a hue angle that means nothing. */
    warmth: dh * (180 / Math.PI) * Math.min(1, Math.hypot(p[1], p[2]) / 12),
    deltaE: deltaE(product, skin),
  };
}

/*
 * Undertone, as the counter would name it.
 *
 * The thresholds look oddly close together until you plot skin: every human
 * complexion lands in a hue band about thirty degrees wide, and the difference
 * between a pink undertone and a golden one is under twenty degrees of it. Set
 * these at the textbook warm/cool boundaries instead and every person alive
 * comes out "warm", which is how a shade finder ends up recommending the same
 * bottle to everybody.
 */
export function undertone(rgb) {
  const lab = rgbToLab(rgb);
  const hue = Math.atan2(lab[2], lab[1]) * (180 / Math.PI);
  if (hue > 65) return 'warm';       /* golden */
  if (hue < 54) return 'cool';       /* pink */
  return 'neutral';
}

/*
 * Source-over in linear light. `a` is coverage 0..1. Both colours come in as
 * sRGB 0..1 and the result goes back out the same way, so call sites never
 * have to remember which space they are holding.
 */
export function over(base, top, a) {
  const out = new Array(3);
  for (let i = 0; i < 3; i++) {
    const b = srgbToLinear(base[i]), t = srgbToLinear(top[i]);
    out[i] = linearToSrgb(b * (1 - a) + t * a);
  }
  return out;
}

/* Multiply a colour's lightness without shifting its hue — used for the shaded
 * variants of a swatch in the tray, and for the darker rim of a lip. */
export function shade(rgb, k) {
  return rgb.map((c) => Math.max(0, Math.min(1, linearToSrgb(srgbToLinear(c) * k))));
}

/* Perceptual mix along L*a*b*, for generating a shade ramp between two ends of
 * a foundation line. A straight sRGB lerp between fair and deep runs through a
 * grey that exists in no bottle. */
export function mixLab(rgbA, rgbB, t) {
  const a = rgbToLab(rgbA), b = rgbToLab(rgbB);
  return labToRgb([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}

export function labToRgb(lab) {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (116 * t - 16) / 903.3);
  const x = WHITE[0] * inv(fx);
  const y = WHITE[1] * inv(fy);
  const z = WHITE[2] * inv(fz);
  const lin = [
    x * 3.2404542 + y * -1.5371385 + z * -0.4985314,
    x * -0.9692660 + y * 1.8760108 + z * 0.0415560,
    x * 0.0556434 + y * -0.2040259 + z * 1.0572252,
  ];
  return lin.map((c) => Math.max(0, Math.min(1, linearToSrgb(Math.max(0, c)))));
}
