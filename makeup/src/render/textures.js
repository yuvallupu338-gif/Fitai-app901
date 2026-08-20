/*
 * textures.js — every surface in the shop, computed.
 *
 * There are no image files. Each recipe writes RGB plus a height in the alpha
 * channel, and the shader differences that height in screen space to get a
 * normal — so the bump on a countertop always agrees with the pattern on it,
 * because they came out of the same expression.
 *
 * The face is the one that matters. Its texture is not a photograph of skin;
 * it is the set of things that are true of a face *before* any makeup goes on
 * it: the tone and how it shifts across the cheeks, the natural colour of the
 * lips, the brows, the lash line, the shadow in the socket. Everything the
 * player does is composited over it at draw time, never baked into it, so
 * wiping a customer's face clean is a memset and not a regeneration.
 */

import { fbm, hash2, valueNoise, makeRng } from '../core/rng.js';
import { clamp, smoothstep, lerp } from '../core/math.js';
import { rgbToLab, labToRgb } from '../core/color.js';
import {
  F, ZONES, lipMask, lipLower, browField, eyeOpening, ellipse, pair,
} from '../model/face.js';

/* Write a texture by evaluating a function per texel. `fn` returns
 * [r, g, b, height] with everything in 0..1. */
function makeTex(size, fn) {
  const px = new Uint8Array(size * size * 4);
  const out = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      fn(u, v, out, x, y);
      const i = (y * size + x) * 4;
      px[i] = clamp(out[0], 0, 1) * 255;
      px[i + 1] = clamp(out[1], 0, 1) * 255;
      px[i + 2] = clamp(out[2], 0, 1) * 255;
      px[i + 3] = clamp(out[3], 0, 1) * 255;
    }
  }
  return px;
}

/* ------------------------------------------------------------------ *
 * Skin
 * ------------------------------------------------------------------ */

/*
 * A face's base texture.
 *
 * The parts that are easy to get wrong and matter most:
 *
 *  - the middle of the face is redder than the jaw on every skin tone, and
 *    without that the head reads as a painted mannequin no matter how good the
 *    lighting is;
 *  - the natural lip is not a colour, it is a colour with vertical striations
 *    and a darker edge, and a flat one looks like a sticker;
 *  - brows are hair. Drawn as a solid shape they age the customer by twenty
 *    years and make every look worse than it is.
 */
/*
 * How many hairs are drawn across one brow.
 *
 * Exported because it is a sampling rate, not a taste: a brow is about 0.176
 * wide in s, so on a 1024-pixel skin texture these get six pixels each. Raise
 * it much past this and the brow stops being hair and starts being noise — see
 * the note where it is used. The audit checks it against the texture size.
 */
export const BROW_HAIRS = 30;

export function skinTexture(size, customer) {
  const rng = makeRng(customer.seed + 7717);
  const seed = (rng() * 1e6) | 0;
  const base = customer.skin;
  const lab = rgbToLab(base);

  /* Redness is added in Lab so it stays a shift towards red at the same
   * lightness rather than a wash of pink over the top. */
  const redder = (amount) => labToRgb([lab[0] - amount * 2.2, lab[1] + amount * 7, lab[2] + amount * 1.5]);
  const darker = (amount) => labToRgb([lab[0] - amount, lab[1] + amount * 0.10, lab[2] + amount * 0.05]);

  const lipBase = labToRgb([
    lab[0] - 9 - customer.lipDepth * 8,
    lab[1] + 13 + customer.lipDepth * 7,
    lab[2] + 2,
  ]);
  const browCol = customer.hairRgb.map((c) => c * 0.72);

  return makeTex(size, (s, t, out) => {
    /* ---- tone ---- */
    const centre = ellipse(s, t, 0.5, 0.50, 0.30, 0.30, 1);
    /*
     * How much redder than the base tone this part of the face is. The middle
     * of a face is warmer than its edges on every skin, but only just: the
     * first version of this pushed a* by as much as seventeen units and turned
     * every customer bright orange, several shades away from the tone she was
     * supposed to be — and the same tone was still correct on her neck, which
     * is how it was eventually spotted.
     */
    const cheekWarm = clamp(ZONES.cheek(s, t) * 0.30 + centre * 0.16
      + ellipse(s, t, 0.5, F.noseTipT, 0.09, 0.07, 0.9) * 0.22, 0, 0.62);
    const mottle = fbm(s * 26, t * 26, 4, seed) - 0.5;
    const large = fbm(s * 6, t * 6, 3, seed + 91) - 0.5;

    let col = redder(cheekWarm * (0.85 + customer.flush * 0.5) + mottle * 0.12);
    col = col.map((c) => clamp(c * (1 + large * 0.055) + mottle * 0.012, 0, 1));

    /* Edges of the face and the underside of the jaw sit in their own shadow
     * even before any light reaches them. */
    const edge = 1 - 0.20 * smoothstep(0.30, 0.50, Math.abs(s - 0.5))
      - 0.16 * smoothstep(0.80, 0.98, t);
    col = col.map((c) => c * edge);

    /* ---- the sockets and the places a face is always a little darker ---- */
    const socketShade = pair(s, t, F.eyeS, F.eyeT - 0.010, 0.100, 0.046, 0.9);
    const nasolabial = pair(s, t, 0.135, 0.575, 0.030, 0.055, 0.95);
    const underNose = ellipse(s, t, 0.5, F.noseBaseT + 0.014, 0.115, 0.014, 0.9);
    const shading = socketShade * 0.20 + nasolabial * 0.10 + underNose * 0.12;
    col = col.map((c) => c * (1 - shading));

    /* ---- freckles ---- */
    let height = 0.5;
    if (customer.freckles > 0) {
      const area = Math.max(ZONES.cheek(s, t), ellipse(s, t, 0.5, F.noseTipT, 0.10, 0.06, 0.9));
      const n = hash2((s * size * 0.5) | 0, (t * size * 0.5) | 0, seed + 3);
      const spot = n > 1 - customer.freckles * 0.10 ? 1 : 0;
      if (spot && area > 0.15) {
        const d = darker(16 * area);
        col = [lerp(col[0], d[0], 0.55), lerp(col[1], d[1], 0.55), lerp(col[2], d[2], 0.55)];
      }
    }

    /* ---- pores and fine lines ---- */
    const pore = valueNoise(s * size * 0.9, t * size * 0.9, seed + 11);
    height = 0.42 + pore * 0.16;

    /* ---- lips ---- */
    const lm = lipMask(s, t);
    if (lm > 0.001) {
      /*
       * Vertical striations, a darker vermilion border, a lighter centre on the
       * lower lip.
       *
       * The striations used to carry a third of the whole height range, and
       * through the bump mapping that turned the mouth into a piece of
       * corduroy: a row of hard ridges you could count from across the shop. A
       * real lip's lines are something you see at arm's length and cannot feel,
       * so they are mostly colour here and barely any height, and they fade out
       * towards the middle of each lobe where the light catches instead.
       */
      const stria = 0.5 + 0.5 * Math.sin(s * 760 + valueNoise(s * 70, t * 12, seed + 5) * 9);
      const edge = smoothstep(0.45, 1.0, 1 - lm);
      const rim = smoothstep(0.80, 1.0, 1 - lm);
      const lower = lipLower(s, t);
      const lipCol = lipBase.map((c) =>
        clamp(c * (0.94 + stria * 0.11 * (0.30 + 0.70 * edge))
          * (1 - rim * 0.26) * (1 + lower * 0.12), 0, 1));
      const a = smoothstep(0, 0.35, lm);
      col = [lerp(col[0], lipCol[0], a), lerp(col[1], lipCol[1], a), lerp(col[2], lipCol[2], a)];
      height = lerp(height, 0.46 + stria * 0.09 * edge + lower * 0.07, a);
    }

    /* ---- brows ---- */
    const bg = browField(s, t);
    if (bg && bg.m > 0.002) {
      /*
       * Hairs, not a smudge.
       *
       * This used to sample two octaves of noise at nine hundred cycles across
       * a thousand-pixel texture — nearly one cycle per pixel, well past what
       * the texture can hold — so what landed on the face was not hair, it was
       * the aliasing of hair: a leopard-print patch floating over each eye. The
       * frequency here is picked against the pixels that have to carry it, six
       * or so to a hair, and the audit holds it there.
       *
       * A brow hair leaves the skin pointing up and out at the head of the brow
       * and lies flatter along the arch past the peak, so the strokes shear
       * with `along` rather than running parallel to each other.
       */
      const lean = 1.15 - 0.95 * smoothstep(-0.7, 0.5, bg.along);
      const wob = fbm(bg.along * 5 + 3, bg.across * 2, 2, seed + 17) - 0.5;
      const q = bg.along * BROW_HAIRS + bg.across * lean * 3.0 + wob * 2.2;
      const hair = Math.pow(0.5 + 0.5 * Math.cos(q * Math.PI), 1.6);
      /* Thinner at the tail, and feathered along both edges the way a brow
       * nobody has drawn on with a pencil actually is. */
      const body = Math.pow(bg.m, 0.55) * (1 - 0.35 * smoothstep(0.35, 1, bg.along));
      const a = clamp(body * (0.26 + 0.74 * hair) * customer.browDensity, 0, 1);
      col = [lerp(col[0], browCol[0], a), lerp(col[1], browCol[1], a),
        lerp(col[2], browCol[2], a)];
      height = lerp(height, 0.70, a * 0.75);
    }

    /* ---- lashes and the wet line ---- */
    const lash = ZONES.lash(s, t);
    if (lash > 0.01) {
      const a = smoothstep(0.25, 0.85, lash) * 0.75;
      col = col.map((c) => c * (1 - a * 0.82));
      height = lerp(height, 0.66, a);
    }

    /*
     * Inside the eye opening the head is hidden behind an eyeball; making it
     * dark rather than skin-coloured means a sliver showing at a steep angle
     * reads as shadow instead of as a hole in the face.
     *
     * Gently, though. The lids borrow these coordinates, so whatever is painted
     * here is also painted along the lid margin an inch away from the camera —
     * and at nearly half strength it was a brown smear across the eye of every
     * customer, which is not what a lid looks like from any distance.
     */
    const open = eyeOpening(s, t);
    if (open > 0.01) col = col.map((c) => c * (1 - open * 0.20));

    out[0] = col[0]; out[1] = col[1]; out[2] = col[2]; out[3] = height;
  });
}

/*
 * The eye. Drawn as a disc because `buildEyeball` gives the front of the eye a
 * planar UV — the iris is a circle in the middle of the texture, the sclera is
 * everything around it, and the far side of the sphere lands in the corners
 * where it is never seen.
 */
/*
 * How much of the eyeball the iris covers, as a fraction of its radius seen
 * head on. A real iris is about half the eyeball's diameter. It is exported
 * because the audit needs it: if the eyeball does not protrude far enough for
 * some sclera to show around the iris, the eye reads as a black hole in the
 * face rather than as an eye, and that is a geometry problem the texture
 * cannot fix.
 */
export const IRIS_RADIUS = 0.34;

export function irisTexture(size, customer) {
  const rng = makeRng(customer.seed + 3391);
  const seed = (rng() * 1e6) | 0;
  const iris = customer.eyeRgb;
  const dark = iris.map((c) => c * 0.35);
  return makeTex(size, (u, v, out) => {
    const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);

    /* Sclera: not white. A white eye is the single most artificial thing a
     * face can have. */
    let col = [0.93, 0.905, 0.88];
    const veins = smoothstep(0.55, 1.0, fbm(u * 30, v * 30, 3, seed + 5)) * smoothstep(0.35, 0.75, r);
    col = [col[0], col[1] * (1 - veins * 0.10), col[2] * (1 - veins * 0.13)];

    const irisR = IRIS_RADIUS;
    if (r < irisR + 0.04) {
      /* Radial fibres, a darker limbal ring at the edge, and a pupil that is
       * a hole rather than a dark circle. */
      const fibre = 0.5 + 0.5 * Math.sin(a * 46 + valueNoise(r * 14, a * 6, seed) * 7);
      const depth = smoothstep(0.04, irisR, r);
      let ic = [
        lerp(dark[0], iris[0], 0.35 + fibre * 0.55 * depth),
        lerp(dark[1], iris[1], 0.35 + fibre * 0.55 * depth),
        lerp(dark[2], iris[2], 0.35 + fibre * 0.55 * depth),
      ];
      const limbal = smoothstep(irisR - 0.07, irisR, r);
      ic = ic.map((c) => c * (1 - limbal * 0.55));
      const pupil = 1 - smoothstep(0.115, 0.140, r);
      ic = ic.map((c) => c * (1 - pupil * 0.94));
      const edge = 1 - smoothstep(irisR, irisR + 0.02, r);
      col = [lerp(col[0], ic[0], edge), lerp(col[1], ic[1], edge), lerp(col[2], ic[2], edge)];
    }
    /*
     * The sclera falls into shadow towards the edges of the eyeball. Without
     * this the exposed part of the sphere ends in a hard white rim against the
     * skin — the eye reads as a ball stuck on a face rather than as an opening
     * in one, because the lids can only cover the top and the bottom and the
     * corners have nothing closing them.
     */
    const rim = 1 - smoothstep(0.52, 0.95, r) * 0.78;
    out[0] = col[0] * rim; out[1] = col[1] * rim; out[2] = col[2] * rim;
    out[3] = 0.5 - (r < irisR ? 0.12 : 0);
  });
}

/* ------------------------------------------------------------------ *
 * The shop
 * ------------------------------------------------------------------ */

/*
 * Skin away from the face — neck, ears, hands. The face texture cannot serve
 * here: it is laid out in face space, and a neck sampling it would come out
 * wearing an eyebrow. This one is neutral and tileable, and the customer's own
 * tone arrives as the draw call's tint.
 */
export function bodySkinTexture(size) {
  const seed = 3803;
  return makeTex(size, (u, v, out) => {
    const pore = fbm(u * size * 0.8, v * size * 0.8, 2, seed, size * 0.8);
    const soft = fbm(u * 7, v * 7, 3, seed + 13, 7) - 0.5;
    const c = 0.97 + soft * 0.05 + (pore - 0.5) * 0.05;
    out[0] = c; out[1] = c * 0.995; out[2] = c * 0.99;
    out[3] = 0.42 + pore * 0.16;
  });
}

export function hairTexture(size, rgb) {
  const seed = 4211;
  /* The lit end of the range, not a brighter version of the whole thing: adding
   * a constant here washed platinum blonde out to white and made it disappear
   * against skin. */
  const tip = rgb.map((c) => clamp(c * 1.10, 0, 1));
  const root = rgb.map((c) => c * 0.44);
  return makeTex(size, (u, v, out) => {
    /*
     * Strands, as an actual periodic function rather than noise.
     *
     * The first version asked for `fbm(u * 340, ...)` in a 256-texel map — 340
     * cycles across 256 samples, well past the point where a texture can carry
     * them. What comes out is not fine hair, it is white noise, and on screen it
     * reads as a sheet of speckled plastic. The frequency that matters is the
     * one that survives sampling: a strand every five or six texels, phase
     * broken up by a *low* frequency noise so they are not a comb.
     *
     * They run along V because that is how every hair mesh here is unwrapped —
     * so the variation across a lock belongs on U, and along its length there
     * should be almost none.
     */
    const jitter = valueNoise(u * 9, v * 2.0, seed) * 2.4;
    const strand = 0.5 + 0.5 * Math.sin((u * 44 + jitter) * Math.PI * 2);
    /* Sharpened, so a strand is a strand and not a sine wave. */
    const fibre = Math.pow(strand, 1.7);
    /* Broad light and dark locks, which is most of what reads as hair at any
     * distance a customer is actually seen from. */
    const lock = fbm(u * 5, v * 2.2, 2, seed + 31);
    const k = clamp(0.12 + fibre * 0.34 + lock * 0.46, 0, 1);
    out[0] = lerp(root[0], tip[0], k);
    out[1] = lerp(root[1], tip[1], k);
    out[2] = lerp(root[2], tip[2], k);
    /* The alpha channel is the bump height, not opacity. Following the strands
     * is what makes the light break along them instead of across them. */
    out[3] = 0.34 + fibre * 0.42;
  });
}

export function marbleTexture(size) {
  const seed = 907;
  return makeTex(size, (u, v, out) => {
    /* Veins are a warped sine: the warp is what stops them looking like
     * contours on a map. */
    const warp = fbm(u * 3, v * 3, 4, seed, 3) * 2.2;
    const vein = Math.abs(Math.sin((u * 2.4 + v * 1.1 + warp) * Math.PI * 2));
    const thin = Math.pow(1 - vein, 22);
    const grain = fbm(u * 40, v * 40, 3, seed + 5, 40);
    const base = 0.86 + grain * 0.10;
    const c = base - thin * 0.42;
    out[0] = c * 1.0;
    out[1] = c * 0.985;
    out[2] = c * 0.965;
    out[3] = 0.5 + thin * 0.10 + grain * 0.06;
  });
}

export function lacquerTexture(size) {
  const seed = 611;
  return makeTex(size, (u, v, out) => {
    const grain = fbm(u * 90, v * 90, 2, seed, 90) - 0.5;
    const c = 0.30 + grain * 0.05;
    out[0] = c; out[1] = c; out[2] = c;
    out[3] = 0.5 + grain * 0.25;
  });
}

export function metalTexture(size) {
  const seed = 733;
  return makeTex(size, (u, v, out) => {
    /* Brushed: noise stretched hard along one axis. */
    const brush = fbm(u * 400, v * 8, 3, seed, 400);
    const c = 0.55 + (brush - 0.5) * 0.20;
    out[0] = c; out[1] = c * 0.995; out[2] = c * 0.97;
    out[3] = 0.5 + (brush - 0.5) * 0.5;
  });
}

export function wallTexture(size) {
  const seed = 1301;
  return makeTex(size, (u, v, out) => {
    const grain = fbm(u * 130, v * 130, 3, seed, 130) - 0.5;
    const soft = fbm(u * 5, v * 5, 2, seed + 3, 5) - 0.5;
    const c = 0.80 + grain * 0.035 + soft * 0.05;
    out[0] = c * 1.0; out[1] = c * 0.975; out[2] = c * 0.96;
    out[3] = 0.5 + grain * 0.35;
  });
}

export function floorTexture(size) {
  const seed = 1699;
  return makeTex(size, (u, v, out) => {
    /* Large format tile with a soft terrazzo fleck and a grout line. */
    const gx = Math.abs(((u * 2) % 1) - 0.5), gy = Math.abs(((v * 2) % 1) - 0.5);
    const grout = 1 - smoothstep(0.455, 0.49, Math.max(gx, gy));
    const fleck = smoothstep(0.62, 0.78, fbm(u * 150, v * 150, 2, seed, 150));
    const marb = fbm(u * 10, v * 10, 3, seed + 9, 10);
    let c = 0.30 + marb * 0.08 + fleck * 0.22;
    c *= 0.45 + grout * 0.55;
    out[0] = c * 1.0; out[1] = c * 0.99; out[2] = c * 1.02;
    out[3] = 0.35 + grout * 0.3 + fleck * 0.2;
  });
}

export function fabricTexture(size, rgb) {
  const seed = 2207;
  return makeTex(size, (u, v, out) => {
    /* A weave: two perpendicular ribs beating against each other. */
    const warp = 0.5 + 0.5 * Math.sin(u * size * 0.9 * Math.PI);
    const weft = 0.5 + 0.5 * Math.sin(v * size * 0.9 * Math.PI);
    const w = warp * 0.5 + weft * 0.5;
    const fuzz = fbm(u * 200, v * 200, 2, seed, 200) - 0.5;
    const k = 0.82 + w * 0.22 + fuzz * 0.12;
    out[0] = rgb[0] * k; out[1] = rgb[1] * k; out[2] = rgb[2] * k;
    out[3] = 0.35 + w * 0.45;
  });
}

/*
 * Packaging. One texture serves every bottle on the shelf: a band of label
 * around the middle and a slightly different finish above and below it, tinted
 * per draw call. The lathe UVs run around the bottle in U and up it in V.
 */
export function packageTexture(size) {
  const seed = 505;
  return makeTex(size, (u, v, out) => {
    const label = smoothstep(0.30, 0.34, v) * (1 - smoothstep(0.62, 0.66, v));
    const cap = smoothstep(0.80, 0.84, v);
    const grain = fbm(u * 60, v * 60, 2, seed, 60) - 0.5;
    /* A printed line or two on the label, at a size that reads as type from a
     * metre away and as nothing in particular from closer. */
    const line = (smoothstep(0.44, 0.45, v) * (1 - smoothstep(0.47, 0.48, v))
      + smoothstep(0.51, 0.515, v) * (1 - smoothstep(0.53, 0.535, v)))
      * (1 - smoothstep(0.30, 0.40, Math.abs(u - 0.5)));
    let c = 0.92 - cap * 0.35 + grain * 0.04;
    c = lerp(c, 0.97, label * 0.55);
    c *= 1 - line * 0.65;
    out[0] = c; out[1] = c; out[2] = c;
    out[3] = 0.5 + grain * 0.2 + label * 0.06 + cap * 0.05;
  });
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

/*
 * Two surfaces in the shop carry words: the sign over the shelves and the till
 * screen. Both are drawn with the 2D canvas — still generated at runtime, still
 * no files, and the alternative is a hand-built bitmap font for Hebrew, which
 * is a month of work to make a price legible.
 */
export function canvasTexture(width, height, draw) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  draw(g, width, height);
  const img = g.getImageData(0, 0, width, height);
  return new Uint8Array(img.data.buffer.slice(0));
}

export function signTexture(name) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#120a12';
    g.fillRect(0, 0, w, h);
    g.font = '600 62px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff7ec8';
    g.shadowBlur = 26;
    g.fillStyle = '#ffd9ef';
    g.fillText(name, w / 2, h / 2 + 2);
    g.shadowBlur = 10;
    g.fillText(name, w / 2, h / 2 + 2);
  });
}

export function tillScreenTexture(lines, total) {
  return canvasTexture(256, 168, (g, w, h) => {
    g.fillStyle = '#07161a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0d2a30';
    g.fillRect(0, 0, w, 26);
    g.font = '600 15px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillStyle = '#7fe6d0';
    g.fillText('קופה 1', w - 8, 19);
    g.font = '14px "Segoe UI", system-ui, sans-serif';
    let y = 46;
    for (const line of lines.slice(-6)) {
      g.fillStyle = '#bfeee2';
      g.fillText(line.name, w - 8, y);
      g.textAlign = 'left';
      g.fillText('₪' + line.price, 8, y);
      g.textAlign = 'right';
      y += 19;
    }
    g.fillStyle = '#0d2a30';
    g.fillRect(0, h - 32, w, 32);
    g.font = '700 20px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = '#8ff5d8';
    g.fillText('₪' + total.toFixed(0), w - 8, h - 10);
    g.textAlign = 'left';
    g.fillText('סה"כ', 8, h - 10);
  });
}

/* A flat 1x1 for materials that are pure colour. Keeps the shader on one code
 * path instead of branching on whether a texture exists. */
export function flatTexture() {
  return new Uint8Array([255, 255, 255, 128]);
}
