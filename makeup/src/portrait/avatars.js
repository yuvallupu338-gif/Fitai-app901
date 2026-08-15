/*
 * avatars.js — turning a photograph into something the counter can serve.
 *
 * Everything expensive about a photographic customer happens here, once, when
 * she is first prepared: decode the picture, rotate and cut it to a square
 * around the face, rasterise the zones through the frame, bake the normals, and
 * read her actual skin colour back out of her own cheek.
 *
 * That last one is the point of doing it at load rather than at build. The
 * whole shade-matching mechanic asks "is this foundation right for *her*", and
 * with a photograph the honest answer is not a colour somebody typed into a
 * table — it is the colour of the face in the picture, measured off the pixels,
 * away from the mouth and the eyes and anywhere makeup is likely to already be.
 */

import { PHOTOS } from '../data/avatars/index.js';
import { makeFrame, validateAvatar } from './frame.js';
import { buildPortraitMasks, buildPortraitNormals } from './masks.js';
import { SKIN_TONES } from '../data/people.js';
import { srgbToLinear, linearToSrgb, rgbToHex, hexToRgb, deltaE } from '../core/color.js';
import { ZONE_NAMES } from '../model/face.js';

/* Photographs added at runtime — by the marking tool's preview, and by the
 * smoke test, which builds one on a canvas so the whole path from pixels to
 * lipstick is covered without a face being committed to the repository. */
const runtime = [];

/*
 * Whether the committed photographs count.
 *
 * Off, the counter behaves exactly as it does in a checkout with no faces in
 * it, and only avatars added at run time are served. That is what lets the
 * smoke test drive both paths on any working copy: it turns the committed list
 * off, plays a modelled customer, then registers its own drawn face and plays a
 * photographed one. Without it, adding a photograph to the repository would
 * silently retire half the test suite.
 */
let photosOn = true;

export function setPhotosEnabled(on) {
  photosOn = !!on;
  cache.clear();
}

export function listAvatars() {
  return [...(photosOn ? PHOTOS : []), ...runtime];
}

export function hasAvatars() {
  return PHOTOS.length + runtime.length > 0;
}

export function registerAvatar(avatar) {
  const problems = validateAvatar(avatar);
  if (problems.length) throw new Error('avatar rejected:\n  ' + problems.join('\n  '));
  const at = runtime.findIndex((a) => a.id === avatar.id);
  if (at >= 0) runtime[at] = avatar; else runtime.push(avatar);
  cache.clear();
  return avatar;
}

/* The same photograph for the same customer, every time. A shift is replayable
 * from its seed and a face that moved between two runs of the same seed would
 * break that in the most confusing way available. */
export function pickAvatar(rng) {
  const all = listAvatars();
  if (!all.length) return null;
  return rng.pick(all);
}

export function avatarById(id) {
  return listAvatars().find((a) => a.id === id) || null;
}

/* ------------------------------------------------------------------ *
 * Preparation
 * ------------------------------------------------------------------ */

const cache = new Map();

function decode(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('the avatar image could not be decoded'));
    img.decoding = 'async';
    img.src = src;
  });
}

/*
 * Draw the photograph into a square, upright, cut to the face.
 *
 * The transform comes from the frame, so the canvas that comes out is in crop
 * space by construction: pixel (x, y) here, texel (x, y) of the mask, and texel
 * (x, y) of the paint layer are the same place on the same face. Every lookup
 * downstream — in the shader, in the coverage stats, in the scoring — is then a
 * plain fetch with no mapping at all, which is worth far more than the
 * milliseconds this costs.
 */
function bakeCrop(img, frame, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  /* Off the edge of a photograph there is nothing to draw. Black would ring the
   * face; the game's own background lets the crop end without an edge. */
  ctx.fillStyle = '#14090f';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  const m = frame.cropTransform(size);
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return new Uint8Array(ctx.getImageData(0, 0, size, size).data.buffer);
}

/*
 * Her colour, measured.
 *
 * Sampled from the parts of the face that are skin and are least likely to
 * already have something on them: not the lips, not the lids or lashes, not the
 * brows, not the cheeks where blusher goes and not under the eyes where
 * concealer does. What is left is forehead, temples, the sides of the face and
 * the chin — which is, not by coincidence, where a counter would check a shade.
 *
 * Averaged in linear light. Averaging sRGB bytes biases every mean towards the
 * dark end, and on a face that is the difference between one shade and the next.
 */
const AVOID = ['lip', 'brow', 'lid', 'lash', 'cheek', 'underEye'];

export function sampleSkin(pixels, masks) {
  const n = masks.size;
  const skin = masks.zones.skin;
  const avoid = AVOID.map((z) => masks.zones[z]).filter(Boolean);
  let r = 0, g = 0, b = 0, wsum = 0;

  for (let i = 0; i < n * n; i++) {
    let w = skin[i] / 255;
    if (w < 0.5) continue;
    for (const a of avoid) w *= 1 - a[i] / 255;
    if (w < 0.25) continue;
    const p = i * 4;
    r += srgbToLinear(pixels[p] / 255) * w;
    g += srgbToLinear(pixels[p + 1] / 255) * w;
    b += srgbToLinear(pixels[p + 2] / 255) * w;
    wsum += w;
  }
  if (wsum <= 0) return null;
  return [
    linearToSrgb(r / wsum),
    linearToSrgb(g / wsum),
    linearToSrgb(b / wsum),
  ];
}

/*
 * The measured colour, dressed as a catalogue tone.
 *
 * `tone` — cool, neutral or warm — is what the shade-matching penalty is judged
 * against, and there is no way to read an undertone off a single average with
 * any confidence, so it is borrowed from the nearest entry in the table the
 * foundation ramp was built to cover. The hex stays measured: the match is
 * against her, the label is the nearest word for her.
 */
export function toneFromSkin(rgb) {
  let best = SKIN_TONES[0], bestD = Infinity;
  for (const cand of SKIN_TONES) {
    const d = deltaE(rgb, hexToRgb(cand.hex));
    if (d < bestD) { bestD = d; best = cand; }
  }
  return { hex: rgbToHex(rgb), he: best.he, tone: best.tone, measured: true };
}

/*
 * Everything above, cached. Preparing a face is a decode, a draw and about two
 * million zone evaluations; a customer who walks back in should not pay for it
 * twice, and neither should the second shift of the same day.
 */
export async function prepareAvatar(avatar, size = 1024, maskSize = 512) {
  const key = `${avatar.id}:${size}:${maskSize}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const img = await decode(avatar.image);
  const av = (avatar.width > 0 && avatar.height > 0)
    ? avatar
    : { ...avatar, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };

  const frame = makeFrame(av);
  const pixels = bakeCrop(img, frame, size);
  const masks = buildPortraitMasks(frame, maskSize);
  const normals = buildPortraitNormals(frame, 256);

  const skin = sampleSkin(pixels, masks);
  if (!skin) throw new Error(`avatar "${av.id}": the marks leave no skin to sample`);

  const prepared = {
    avatar: av, frame, masks, normals, pixels, size,
    tone: toneFromSkin(skin),
    skin,
  };
  cache.set(key, prepared);
  return prepared;
}

export function forgetAvatars() {
  cache.clear();
}

/* Exported for the audit, which checks that a prepared face has a usable amount
 * of every zone on it — a mask that came out empty is a product that silently
 * cannot be applied, and nothing else in the game would say so. */
export function maskCoverage(masks) {
  const out = {};
  for (const name of ZONE_NAMES) {
    const buf = masks.zones[name];
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    out[name] = sum / 255 / (masks.size * masks.size);
  }
  return out;
}
