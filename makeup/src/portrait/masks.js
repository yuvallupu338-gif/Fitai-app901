/*
 * masks.js — the zones of a photographed face.
 *
 * `model/face.js` already says what a cheek is, in face space. `frame.js`
 * already says which part of a photograph a face-space coordinate is. So this
 * module is one loop: walk the crop, ask the frame where each pixel is on a
 * face, ask the zone how much of itself is there, multiply by whether the pixel
 * is on the face at all.
 *
 * The output is deliberately the exact structure `buildMasks` returns —
 * `{ size, zones }` of Uint8Array — because `PaintLayer`, `sampleMask`,
 * `maskTotal`, the coverage stats and the scoring all consume that and nothing
 * else. Getting the shape right here is what makes the photographic mode a new
 * *surface* rather than a second game.
 *
 * The loop is written pixel-outermost, zone-innermost, which is the opposite of
 * the 3D one. There the map is two cheap warps; here it is two curve
 * evaluations and a rotation, and doing them once per pixel instead of once per
 * pixel per zone is the difference between a fifth of a second and two.
 */

import { ZONES, ZONE_NAMES } from '../model/face.js';
import { clamp } from '../core/math.js';

/*
 * The eyes and the mouth of a photograph are already open, and the paint layer
 * has no idea. Foundation brushed across a photographed eye covers the iris;
 * lipstick brushed past the lip line lands on the teeth. In the 3D head the
 * geometry prevents both — there is no skin there to paint on. Here the only
 * defence is the mask, so `skin` is cut by the same eye opening the model uses
 * and every zone is cut by the outline.
 */
export function buildPortraitMasks(frame, size = 512) {
  const zones = {};
  const fns = ZONE_NAMES.map((name) => ZONES[name]);
  for (const name of ZONE_NAMES) zones[name] = new Uint8Array(size * size);
  const bufs = ZONE_NAMES.map((name) => zones[name]);

  for (let y = 0; y < size; y++) {
    const q = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const p = (x + 0.5) / size;
      const on = frame.outline(p, q);
      const i = y * size + x;
      if (on <= 0) continue;
      const [s, t] = frame.cropToFace(p, q);
      for (let z = 0; z < fns.length; z++) {
        const cov = fns[z](s, t) * on;
        if (cov > 0) bufs[z][i] = Math.round(clamp(cov, 0, 1) * 255);
      }
    }
  }

  return { size, zones, portrait: true };
}

/*
 * The normal field, baked once.
 *
 * A photograph has no geometry, and gloss without geometry is a flat wash that
 * reads as a sticker. What it does have is a face at a known place, and a face
 * is close enough to an ellipsoid that its normals can be reconstructed from
 * face space alone: longitude across, latitude down, both already in the warps.
 *
 * That gives the large-scale shape — light travels across the lip and around
 * the cheek — and the shader adds the small-scale detail from the photograph's
 * own luminance, where the real pores and the real crease of the lip are. The
 * two together are what makes a gloss sit *on* a mouth instead of over it.
 *
 * Stored as an RGB8 texture in the usual [0,1] encoding, with alpha carrying
 * the outline so the shader can fade the whole effect out at the jaw in the
 * same fetch.
 */
export function buildPortraitNormals(frame, size = 256) {
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const q = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const p = (x + 0.5) / size;
      const i = (y * size + x) * 4;

      const [s, t] = frame.cropToFace(p, q);
      /* Face space is the unwrap of a head, so its own coordinates are the
       * angles: s across is longitude, t down is latitude. The constants are
       * how much of a sphere a face is — a little over a third of the way round
       * and a little under half of the way down. */
      const lon = (s - 0.5) * Math.PI * 1.15;
      const lat = (t - 0.5) * Math.PI * 0.80;
      const cl = Math.cos(lat);
      let nx = Math.sin(lon) * cl;
      let ny = -Math.sin(lat);
      let nz = Math.cos(lon) * cl;

      /* The nose. It is the one feature an ellipsoid cannot express and the one
       * a highlighter is aimed down, so it is added explicitly: a ridge along
       * the centre line that tips the normal outwards on each side of it. */
      const ridge = Math.exp(-(((s - 0.5) / 0.085) ** 2))
        * Math.exp(-(((t - 0.470) / 0.075) ** 2));
      nx += Math.sign(s - 0.5) * ridge * 0.55;

      const len = Math.hypot(nx, ny, nz) || 1;
      data[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      data[i + 3] = Math.round(clamp(frame.outline(p, q), 0, 1) * 255);
    }
  }
  return { size, data };
}
