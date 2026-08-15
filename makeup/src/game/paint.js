/*
 * paint.js — what the brush actually does.
 *
 * Two textures hold everything the player has put on a face:
 *
 *   colour  rgb = the product's colour, a = how much of it is there
 *   fx      r = finish (matte..wet), g = shimmer, b = powder
 *
 * They are CPU buffers that get uploaded to the GPU in dirty rectangles. That
 * is the design decision worth defending: the alternative — painting into a
 * framebuffer with a shader — is faster to draw but makes reading it back to
 * score it a stall, and this game reads it constantly. A splat is a few
 * thousand texels of arithmetic; a readback of a GPU texture mid-frame is a
 * pipeline flush.
 *
 * A stroke does *not* stop dead at the edge of its zone. Products land outside
 * where they belong, faintly, and the scoring counts that as mess. Clipping
 * hard would remove the only way to be bad at applying something, and the
 * assist slider exists so that a player using a finger on a phone is not
 * punished for the input device.
 */

import { createTexture2D, updateTextureRect, regenMips } from '../core/gl.js';
import { clamp, smoothstep } from '../core/math.js';
import { sampleMask, ZONE_NAMES } from '../model/face.js';
import { hexToRgb, srgbToLinear, linearToSrgb, rgbToHex } from '../core/color.js';
import { zoneOf, itemKey, itemName } from '../data/products.js';

/* Brush radius per category, as a fraction of the texture width. A liner is
 * one twentieth the size of a foundation brush, which is the whole reason a
 * wing is hard and a base is not. */
export const BRUSH = {
  prep: 0.090,
  foundation: 0.082,
  powder: 0.090,
  concealer: 0.048,
  contour: 0.055,
  blush: 0.062,
  highlighter: 0.042,
  brow: 0.020,
  eyeshadow: 0.040,
  liner: 0.011,
  mascara: 0.016,
  lipstick: 0.030,
  gloss: 0.032,
  tool: 0.080,
};

/* Finish, as the three numbers the shader reads. */
export function finishFx(product) {
  const gloss = {
    matte: 0.02, satin: 0.45, dewy: 0.72, gloss: 0.95,
    shimmer: 0.55, metallic: 0.82, clean: 0,
  }[product.finish] ?? 0.4;
  return { gloss, shimmer: product.shimmer || 0, powder: product.powder || 0 };
}

export class PaintLayer {
  constructor(gl, caps, size, masks) {
    this.gl = gl;
    this.size = size;
    this.masks = masks;
    this.colour = new Uint8Array(size * size * 4);
    this.fx = new Uint8Array(size * size * 4);
    this.colourTex = createTexture2D(gl, caps, size, size, this.colour, { srgb: true, clamp: true });
    this.fxTex = createTexture2D(gl, caps, size, size, this.fx, { clamp: true });
    this.dirty = null;
    this.ledger = new Map();
    this._stats = null;
    this._statsDirty = true;
    this.assist = 0.7;
    this.strokeCount = 0;
    /* Set while a customer's arrival makeup is being laid down, so what she
     * walked in wearing is never billed to her or offered as something the
     * player chose. */
    this.recordingArrival = false;
    this.bounds = zoneBounds(masks);
  }

  clear() {
    this.colour.fill(0);
    this.fx.fill(0);
    this.ledger.clear();
    this.strokeCount = 0;
    this._statsDirty = true;
    this._markDirty(0, 0, this.size, this.size);
  }

  _markDirty(x0, y0, x1, y1) {
    if (!this.dirty) this.dirty = [x0, y0, x1, y1];
    else {
      this.dirty[0] = Math.min(this.dirty[0], x0);
      this.dirty[1] = Math.min(this.dirty[1], y0);
      this.dirty[2] = Math.max(this.dirty[2], x1);
      this.dirty[3] = Math.max(this.dirty[3], y1);
    }
  }

  /*
   * One dab. `pressure` is 0..1 and comes from how fast the pointer is moving:
   * a slow, deliberate stroke lays down more than a fast sweep, which is both
   * true of a real brush and the only way a player can control build-up.
   */
  splat(s, t, item, pressure = 1) {
    const size = this.size;
    const p = item.product;
    const zone = zoneOf(p);
    const radius = (BRUSH[p.cat] || 0.05) * size;
    const cx = s * size, cy = t * size;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(size, Math.ceil(cx + radius) + 1);
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(size, Math.ceil(cy + radius) + 1);
    if (x1 <= x0 || y1 <= y0) return 0;

    const erase = !!p.erase;
    const rgb = hexToRgb(item.shade.hex);
    const lin = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
    const fx = finishFx(p);
    /* A shade named "clear" is clear: it carries finish and almost no colour.
     * Eight passes of a clear gloss over a red lip must leave a red lip that
     * shines, not a pink one. */
    const tintStrength = (p.tintStrength === undefined ? 1 : p.tintStrength)
      * (item.shade.family === 'clear' ? 0.10 : 1);
    const build = (p.opacity || 0.4) * pressure * 0.5;

    let applied = 0, offZone = 0;
    const r2 = radius * radius;

    for (let y = y0; y < y1; y++) {
      const tv = (y + 0.5) / size;
      for (let x = x0; x < x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const su = (x + 0.5) / size;

        /* Soft brush: full in the middle, feathering to nothing at the edge. */
        const falloff = 1 - smoothstep(0.35, 1, Math.sqrt(d2) / radius);

        /* Nothing may be painted off the front of the face — not the ear, not
         * the back of the head, not the inside of an eye. */
        const paintable = sampleMask(this.masks, 'skin', su, tv);
        const onFace = smoothstep(0.02, 0.30, paintable);
        if (onFace <= 0) continue;

        let w = falloff * build * onFace;
        let zoneW = 1;
        if (zone && !erase) {
          const m = sampleMask(this.masks, zone, su, tv);
          const inZone = smoothstep(0, 0.35, m);
          zoneW = 1 - this.assist * (1 - inZone);
          w *= zoneW;
          if (inZone < 0.25) offZone += w;
        }
        if (w <= 0.0005) continue;

        const i = (y * size + x) * 4;

        if (erase) {
          const k = 1 - clamp(falloff * pressure * 0.85, 0, 1);
          this.colour[i + 3] = this.colour[i + 3] * k;
          this.fx[i] = this.fx[i] * k;
          this.fx[i + 1] = this.fx[i + 1] * k;
          this.fx[i + 2] = this.fx[i + 2] * k;
          applied += falloff;
          continue;
        }

        /*
         * Layering. The new colour goes over the old in linear light and the
         * coverage accumulates towards 1 — which is what makes two passes of a
         * sheer product build to something a single pass cannot reach, and
         * what stops a matte from ever becoming more than opaque.
         */
        const a0 = this.colour[i + 3] / 255;
        const cw = clamp(w * tintStrength, 0, 1);
        const a1 = a0 + (1 - a0) * clamp(w, 0, 1);
        if (a1 > 0) {
          for (let k = 0; k < 3; k++) {
            const old = srgbToLinear(this.colour[i + k] / 255);
            const mixed = old * (1 - cw) + lin[k] * cw;
            this.colour[i + k] = linearToSrgb(mixed) * 255;
          }
        }
        this.colour[i + 3] = clamp(a1, 0, 1) * 255;

        /* Finish blends towards the new product at the rate it is applied, so
         * a gloss over a matte lip changes the shine long before it changes
         * the colour — exactly as it does on a face. */
        const fw = clamp(w * 1.6, 0, 1);
        this.fx[i] = (this.fx[i] / 255 * (1 - fw) + fx.gloss * fw) * 255;
        this.fx[i + 1] = (this.fx[i + 1] / 255 * (1 - fw) + fx.shimmer * fw) * 255;
        /* Powder is the exception: it does not replace the finish under it, it
         * takes shine away, and it never comes back off by putting more on. */
        this.fx[i + 2] = Math.max(this.fx[i + 2], fx.powder * fw * 255);
        if (fx.powder > 0) this.fx[i] = this.fx[i] * (1 - fw * fx.powder * 0.8);

        applied += w;
      }
    }

    if (applied > 0) {
      this._markDirty(x0, y0, x1, y1);
      this._statsDirty = true;
      this._record(item, applied, offZone);
    }
    return applied;
  }

  /*
   * The ledger: which products touched this face and how much of each. Every
   * later question — what to charge for, what she reacted to, what the player
   * can mark as her favourite — is answered from here rather than by trying to
   * infer it back out of the pixels.
   */
  _record(item, amount, offZone) {
    const key = itemKey(item);
    let e = this.ledger.get(key);
    if (!e) {
      e = {
        item, key, name: itemName(item),
        amount: 0, arrivalAmount: 0, offZone: 0, order: this.ledger.size,
      };
      this.ledger.set(key, e);
    }
    if (this.recordingArrival) {
      e.arrivalAmount += amount;
      return;
    }
    e.amount += amount;
    e.offZone += offZone;
  }

  /* Interpolate between two pointer samples so a fast stroke is a line and not
   * a dotted line. The step is a third of the brush radius — closer produces
   * visible banding from repeated blending, further leaves scallops. */
  stroke(fromS, fromT, toS, toT, item, pressure) {
    const radius = (BRUSH[item.product.cat] || 0.05);
    const dist = Math.hypot(toS - fromS, toT - fromT);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.34)));
    let total = 0;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      total += this.splat(fromS + (toS - fromS) * k, fromT + (toT - fromT) * k,
        item, pressure);
    }
    this.strokeCount++;
    return total;
  }

  /* Push whatever changed to the GPU. Called once a frame; mips are only
   * regenerated when the pointer is up, because they cost more than the upload
   * and nothing at this distance can tell during a stroke. */
  flush(settle = false) {
    if (!this.dirty) {
      if (settle && this._needMips) { this._regen(); }
      return;
    }
    const [x0, y0, x1, y1] = this.dirty;
    const w = x1 - x0, h = y1 - y0;
    updateTextureRect(this.gl, this.colourTex, this.colour, x0, y0, w, h, this.size);
    updateTextureRect(this.gl, this.fxTex, this.fx, x0, y0, w, h, this.size);
    this.dirty = null;
    this._needMips = true;
    if (settle) this._regen();
  }

  _regen() {
    regenMips(this.gl, this.colourTex);
    regenMips(this.gl, this.fxTex);
    this._needMips = false;
  }

  /*
   * What is on the face, per zone. Scanning only each zone's own bounding box
   * keeps this cheap enough to run while the player is still working — the HUD
   * shows live coverage, and a number that only appears at the end is a number
   * nobody can act on.
   */
  stats() {
    if (!this._statsDirty && this._stats) return this._stats;
    const out = {};
    const size = this.size;
    const scale = size / this.masks.size;
    for (const zone of ZONE_NAMES) {
      const b = this.bounds[zone];
      let wsum = 0, csum = 0;
      let r = 0, g = 0, bl = 0, gloss = 0, shim = 0, powder = 0, w2 = 0;
      const x0 = Math.floor(b[0] * scale), x1 = Math.min(size, Math.ceil(b[2] * scale));
      const y0 = Math.floor(b[1] * scale), y1 = Math.min(size, Math.ceil(b[3] * scale));
      for (let y = y0; y < y1; y++) {
        const tv = (y + 0.5) / size;
        for (let x = x0; x < x1; x++) {
          const m = sampleMask(this.masks, zone, (x + 0.5) / size, tv);
          if (m < 0.05) continue;
          const i = (y * size + x) * 4;
          const a = this.colour[i + 3] / 255;
          wsum += m;
          csum += m * a;
          if (a > 0.08) {
            const k = m * a;
            r += srgbToLinear(this.colour[i] / 255) * k;
            g += srgbToLinear(this.colour[i + 1] / 255) * k;
            bl += srgbToLinear(this.colour[i + 2] / 255) * k;
            gloss += (this.fx[i] / 255) * k;
            shim += (this.fx[i + 1] / 255) * k;
            powder += (this.fx[i + 2] / 255) * k;
            w2 += k;
          }
        }
      }
      out[zone] = {
        coverage: wsum > 0 ? csum / wsum : 0,
        rgb: w2 > 0
          ? [linearToSrgb(r / w2), linearToSrgb(g / w2), linearToSrgb(bl / w2)]
          : null,
        gloss: w2 > 0 ? gloss / w2 : 0,
        shimmer: w2 > 0 ? shim / w2 : 0,
        powder: w2 > 0 ? powder / w2 : 0,
      };
      out[zone].hex = out[zone].rgb ? rgbToHex(out[zone].rgb) : null;
    }
    this._stats = out;
    this._statsDirty = false;
    return out;
  }

  /* Everything applied, most-used first — the order the till lists them and
   * the order the preference card offers them. */
  applied() {
    return [...this.ledger.values()]
      .filter((e) => !e.item.product.erase && e.amount > 0.8)
      .sort((a, b) => b.amount - a.amount);
  }

  dispose() {
    this.gl.deleteTexture(this.colourTex.tex);
    this.gl.deleteTexture(this.fxTex.tex);
  }
}

/* Bounding box of each mask, in mask texels. Computed once per session. */
function zoneBounds(masks) {
  const out = {};
  const n = masks.size;
  for (const zone of ZONE_NAMES) {
    const buf = masks.zones[zone];
    let x0 = n, y0 = n, x1 = 0, y1 = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (buf[y * n + x] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    out[zone] = x1 >= x0 ? [x0, y0, x1 + 1, y1 + 1] : [0, 0, 0, 0];
  }
  return out;
}
