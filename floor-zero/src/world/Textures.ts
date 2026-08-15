import * as THREE from 'three';
import { RNG } from '../core/RNG';

/**
 * Every surface in the game is drawn here with Canvas2D at load time. No
 * external image files are shipped, so nothing is copyrighted and the whole
 * build stays tiny.
 */

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function surface(width: number, height = width): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, rng: RNG): void {
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng.next() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(image, 0, 0);
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  rng: RNG,
): void {
  ctx.save();
  ctx.beginPath();
  const points = 14;
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (0.6 + rng.next() * 0.6);
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Derived maps                                                        */
/* ------------------------------------------------------------------ */

/** Luminance of a canvas texture, as a 0..1 array the derivers share. */
function luminanceOf(texture: THREE.Texture): { data: Float32Array; width: number; height: number } {
  const source = texture.image as HTMLCanvasElement;
  const width = source.width;
  const height = source.height;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('cannot read a texture that is not canvas backed');
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    data[i] = (pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114) / 255;
  }
  return { data, width, height };
}

/**
 * Sobel height-to-normal. The diffuse textures already encode where a surface
 * is worn, cracked or grouted, so treating their luminance as a height field
 * gives every wall and floor real relief under the moving corridor lights —
 * which is most of the difference between "boxes with pictures on them" and a
 * place.
 */
export function normalFromTexture(texture: THREE.Texture, strength = 2.2): THREE.CanvasTexture {
  const { data, width, height } = luminanceOf(texture);
  const { canvas, ctx } = surface(width, height);
  const out = ctx.createImageData(width, height);
  const at = (x: number, y: number): number =>
    data[((y + height) % height) * width + ((x + width) % width)];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));

      const nx = dx * strength;
      const ny = dy * strength;
      const length = Math.hypot(nx, ny, 1);
      const index = (y * width + x) * 4;
      out.data[index] = ((nx / length) * 0.5 + 0.5) * 255;
      out.data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      out.data[index + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      out.data[index + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  const result = toTexture(canvas, 1, 1);
  result.colorSpace = THREE.NoColorSpace;
  return result;
}

/**
 * Darker, dirtier parts of a surface scatter more. Mapping luminance onto a
 * roughness range gives polished terrazzo its sheen while leaving the grout and
 * the damp patches matte.
 */
export function roughnessFromTexture(
  texture: THREE.Texture,
  darkRoughness = 0.95,
  lightRoughness = 0.55,
): THREE.CanvasTexture {
  const { data, width, height } = luminanceOf(texture);
  const { canvas, ctx } = surface(width, height);
  const out = ctx.createImageData(width, height);
  for (let i = 0; i < data.length; i++) {
    const value = (darkRoughness + (lightRoughness - darkRoughness) * data[i]) * 255;
    out.data[i * 4] = value;
    out.data[i * 4 + 1] = value;
    out.data[i * 4 + 2] = value;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const result = toTexture(canvas, 1, 1);
  result.colorSpace = THREE.NoColorSpace;
  return result;
}

/* ------------------------------------------------------------------ */

export function wallTexture(seed = 7): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);

  ctx.fillStyle = '#cdc5ab';
  ctx.fillRect(0, 0, size, size);

  // Faint, small tonal drift — enough to break up a flat wall without reading
  // as clouds when the texture tiles.
  for (let i = 0; i < 46; i++) {
    blob(
      ctx,
      rng.range(0, size),
      rng.range(0, size),
      rng.range(14, 42),
      `rgba(${rng.int(196, 216)},${rng.int(188, 206)},${rng.int(162, 184)},0.10)`,
      rng,
    );
  }

  // Damp creeping up from the skirting, confined to the bottom fifth.
  for (let i = 0; i < 9; i++) {
    blob(
      ctx,
      rng.range(0, size),
      rng.range(size * 0.86, size * 1.04),
      rng.range(18, 46),
      'rgba(132,116,84,0.16)',
      rng,
    );
  }

  // Vertical drip streaks.
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 42; i++) {
    const x = rng.range(0, size);
    const top = rng.range(0, size * 0.55);
    ctx.strokeStyle = rng.chance(0.5) ? '#a89c7c' : '#8e846a';
    ctx.lineWidth = rng.range(0.5, 1.6);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + rng.range(-3, 3), top + rng.range(40, 200));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Hairline cracks.
  ctx.strokeStyle = 'rgba(104,96,76,0.42)';
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = rng.range(0.4, 0.9);
    ctx.beginPath();
    let x = rng.range(0, size);
    let y = rng.range(0, size);
    ctx.moveTo(x, y);
    for (let step = 0; step < 6; step++) {
      x += rng.range(-22, 22);
      y += rng.range(6, 26);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Scuffs along the bottom, where furniture and shoes reach.
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = '#6f6754';
    ctx.lineWidth = rng.range(1, 3.5);
    const y = rng.range(size * 0.82, size * 0.99);
    ctx.beginPath();
    ctx.moveTo(rng.range(0, size), y);
    ctx.lineTo(rng.range(0, size), y + rng.range(-3, 3));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  grain(ctx, size, size, 20, rng);
  return toTexture(canvas, 1, 1);
}

export function terrazzoTexture(seed = 11): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);

  ctx.fillStyle = '#a8a297';
  ctx.fillRect(0, 0, size, size);

  const chipColors = ['#6f6a60', '#d7d2c6', '#8d7f6a', '#4e4a44', '#bdb3a0', '#7d8a83'];
  for (let i = 0; i < 5200; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(1.2, 5.2);
    ctx.fillStyle = rng.pick(chipColors);
    ctx.globalAlpha = rng.range(0.35, 0.9);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * rng.range(0.5, 1), rng.range(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 4 tiles per texture, joints darker.
  ctx.strokeStyle = 'rgba(50,46,40,0.55)';
  ctx.lineWidth = 2.5;
  for (let i = 1; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo((size / 2) * i, 0);
    ctx.lineTo((size / 2) * i, size);
    ctx.moveTo(0, (size / 2) * i);
    ctx.lineTo(size, (size / 2) * i);
    ctx.stroke();
  }
  ctx.strokeRect(0, 0, size, size);

  for (let i = 0; i < 8; i++) {
    blob(ctx, rng.range(0, size), rng.range(0, size), rng.range(30, 80), 'rgba(60,54,44,0.20)', rng);
  }

  grain(ctx, size, size, 16, rng);
  return toTexture(canvas, 1, 1);
}

export function ceilingTexture(seed = 23): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);

  ctx.fillStyle = '#c8c3b4';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 10; i++) {
    blob(ctx, rng.range(0, size), rng.range(0, size), rng.range(20, 70), 'rgba(150,138,110,0.28)', rng);
  }
  ctx.strokeStyle = 'rgba(120,114,100,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  grain(ctx, size, size, 18, rng);
  return toTexture(canvas, 1, 1);
}

export function concreteTexture(seed = 31): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);
  ctx.fillStyle = '#6d6a64';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 22; i++) {
    blob(ctx, rng.range(0, size), rng.range(0, size), rng.range(14, 46), 'rgba(110,106,98,0.22)', rng);
  }
  grain(ctx, size, size, 15, rng);
  return toTexture(canvas, 1, 1);
}

export function tileWallTexture(seed = 41): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);
  ctx.fillStyle = '#8d8b82';
  ctx.fillRect(0, 0, size, size);
  const tiles = 8;
  const step = size / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const shade = rng.int(196, 226);
      ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 16})`;
      ctx.fillRect(tx * step + 1.5, ty * step + 1.5, step - 3, step - 3);
    }
  }
  for (let i = 0; i < 10; i++) {
    blob(ctx, rng.range(0, size), rng.range(0, size), rng.range(12, 40), 'rgba(90,84,64,0.22)', rng);
  }
  grain(ctx, size, size, 14, rng);
  return toTexture(canvas, 1, 1);
}

export function woodFloorTexture(seed = 53): THREE.CanvasTexture {
  const size = 512;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);
  ctx.fillStyle = '#7a5a3c';
  ctx.fillRect(0, 0, size, size);
  const planks = 7;
  const step = size / planks;
  for (let p = 0; p < planks; p++) {
    const base = rng.int(96, 132);
    ctx.fillStyle = `rgb(${base + 24},${base - 12},${base - 44})`;
    ctx.fillRect(0, p * step, size, step - 1.5);
    ctx.globalAlpha = 0.24;
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = rng.chance(0.5) ? '#4b3320' : '#a9805a';
      ctx.lineWidth = rng.range(0.5, 1.6);
      ctx.beginPath();
      const y = p * step + rng.range(2, step - 3);
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + rng.range(-3, 3), size * 0.6, y + rng.range(-3, 3), size, y + rng.range(-2, 2));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  grain(ctx, size, size, 18, rng);
  return toTexture(canvas, 1, 1);
}

export function carpetTexture(seed = 61): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);
  ctx.fillStyle = '#5b4436';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(120,92,66,0.35)' : 'rgba(48,34,26,0.35)';
    ctx.fillRect(rng.range(0, size), rng.range(0, size), 2, 2);
  }
  grain(ctx, size, size, 20, rng);
  return toTexture(canvas, 1, 1);
}

export function woodDoorTexture(seed = 67): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(seed);

  ctx.fillStyle = '#6f4f33';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = rng.chance(0.5) ? '#43301e' : '#9a7048';
    ctx.lineWidth = rng.range(0.5, 2);
    const x = rng.range(0, w);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + rng.range(-8, 8), h * 0.33, x + rng.range(-8, 8), h * 0.66, x + rng.range(-6, 6), h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Two recessed panels.
  const panels: Array<[number, number, number, number]> = [
    [28, 36, w - 56, h * 0.36],
    [28, h * 0.52, w - 56, h * 0.4],
  ];
  for (const [px, py, pw, ph] of panels) {
    ctx.strokeStyle = 'rgba(40,28,18,0.75)';
    ctx.lineWidth = 5;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(190,152,110,0.30)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
  }

  grain(ctx, w, h, 20, rng);
  return toTexture(canvas, 1, 1);
}

export function metalDoorTexture(seed = 71): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(seed);
  ctx.fillStyle = '#6a6d70';
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = rng.chance(0.5) ? '#9aa0a4' : '#4a4d50';
    ctx.lineWidth = rng.range(0.4, 1.4);
    const y = rng.range(0, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + rng.range(-2, 2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(40,42,44,0.7)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 14, w - 20, h - 28);
  for (let i = 0; i < 12; i++) {
    blob(ctx, rng.range(0, w), rng.range(h * 0.55, h), rng.range(8, 26), 'rgba(122,72,38,0.35)', rng);
  }
  grain(ctx, w, h, 22, rng);
  return toTexture(canvas, 1, 1);
}

export function elevatorMetalTexture(seed = 79): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);
  ctx.fillStyle = '#8b8f92';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 420; i++) {
    ctx.strokeStyle = rng.chance(0.5) ? '#c3c8cb' : '#5f6366';
    ctx.lineWidth = rng.range(0.3, 1.1);
    const x = rng.range(0, size);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rng.range(-1.5, 1.5), size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  grain(ctx, size, size, 12, rng);
  return toTexture(canvas, 1, 1);
}

export function noticeBoardTexture(seed = 83, extraMessage?: string): THREE.CanvasTexture {
  const w = 512;
  const h = 384;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(seed);

  ctx.fillStyle = '#9a7a4e';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(140,110,70,0.5)' : 'rgba(70,52,30,0.45)';
    ctx.fillRect(rng.range(0, w), rng.range(0, h), 3, 3);
  }

  const papers = 5;
  for (let i = 0; i < papers; i++) {
    const pw = rng.range(90, 150);
    const ph = rng.range(70, 120);
    const px = rng.range(12, w - pw - 12);
    const py = rng.range(12, h - ph - 12);
    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.rotate(rng.range(-0.08, 0.08));
    ctx.fillStyle = rng.chance(0.4) ? '#e6e1d0' : '#f1eddf';
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
    ctx.fillStyle = 'rgba(50,45,40,0.62)';
    for (let l = 0; l < 6; l++) {
      const lw = rng.range(pw * 0.35, pw * 0.8);
      ctx.fillRect(-pw / 2 + 8, -ph / 2 + 12 + l * 12, lw, 3);
    }
    ctx.restore();
  }

  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ועד הבית — הרקפת 12', w / 2, 34);

  if (extraMessage) {
    ctx.save();
    ctx.translate(w / 2, h - 58);
    ctx.rotate(-0.03);
    ctx.fillStyle = '#efe9d8';
    ctx.fillRect(-190, -30, 380, 60);
    ctx.fillStyle = '#7a1414';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(extraMessage, 0, 10);
    ctx.restore();
  }

  grain(ctx, w, h, 16, rng);
  return toTexture(canvas, 1, 1);
}

/**
 * The corridor family photo. Variant 0 is the "normal" state; every other
 * variant is an anomaly the player may catch when they look away and back.
 */
export function familyPhotoTexture(variant: number, seed = 97): THREE.CanvasTexture {
  const w = 384;
  const h = 288;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(seed + variant * 131);

  ctx.fillStyle = '#2a241d';
  ctx.fillRect(0, 0, w, h);
  const inset = 22;
  const iw = w - inset * 2;
  const ih = h - inset * 2;

  const sky = ctx.createLinearGradient(0, inset, 0, inset + ih);
  sky.addColorStop(0, '#c9b48c');
  sky.addColorStop(1, '#8d7d61');
  ctx.fillStyle = sky;
  ctx.fillRect(inset, inset, iw, ih);

  const drawFigure = (x: number, scale: number, faceless: boolean, turned: boolean): void => {
    const baseY = inset + ih - 18;
    const bodyH = 96 * scale;
    ctx.fillStyle = turned ? '#3b3630' : '#4a423a';
    ctx.beginPath();
    ctx.moveTo(x - 22 * scale, baseY);
    ctx.lineTo(x - 16 * scale, baseY - bodyH);
    ctx.lineTo(x + 16 * scale, baseY - bodyH);
    ctx.lineTo(x + 22 * scale, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = turned ? '#5a4c3e' : '#d7b491';
    ctx.beginPath();
    ctx.arc(x, baseY - bodyH - 17 * scale, 16 * scale, 0, Math.PI * 2);
    ctx.fill();

    if (!faceless && !turned) {
      ctx.fillStyle = '#2b241c';
      ctx.beginPath();
      ctx.arc(x - 5.5 * scale, baseY - bodyH - 19 * scale, 2.1 * scale, 0, Math.PI * 2);
      ctx.arc(x + 5.5 * scale, baseY - bodyH - 19 * scale, 2.1 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2b241c';
      ctx.lineWidth = 1.6 * scale;
      ctx.beginPath();
      ctx.arc(x, baseY - bodyH - 13 * scale, 5 * scale, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    if (faceless) {
      ctx.fillStyle = 'rgba(60,50,42,0.55)';
      ctx.beginPath();
      ctx.arc(x, baseY - bodyH - 17 * scale, 16 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  switch (variant) {
    case 0:
      drawFigure(w * 0.34, 1, false, false);
      drawFigure(w * 0.5, 1.12, false, false);
      drawFigure(w * 0.66, 0.78, false, false);
      break;
    case 1: // the child is gone
      drawFigure(w * 0.36, 1, false, false);
      drawFigure(w * 0.54, 1.12, false, false);
      break;
    case 2: // every face smeared
      drawFigure(w * 0.34, 1, true, false);
      drawFigure(w * 0.5, 1.12, true, false);
      drawFigure(w * 0.66, 0.78, true, false);
      break;
    case 3: // everyone turned around
      drawFigure(w * 0.34, 1, false, true);
      drawFigure(w * 0.5, 1.12, false, true);
      drawFigure(w * 0.66, 0.78, false, true);
      break;
    case 4: // one figure too many, standing apart
      drawFigure(w * 0.3, 1, false, false);
      drawFigure(w * 0.46, 1.12, false, false);
      drawFigure(w * 0.61, 0.78, false, false);
      drawFigure(w * 0.83, 1.05, true, false);
      break;
    default: // the technician, alone, in the corridor
      ctx.fillStyle = '#6d6455';
      ctx.fillRect(inset, inset, iw, ih);
      drawFigure(w * 0.5, 1.3, true, false);
      break;
  }

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#3a2f22';
  ctx.fillRect(inset, inset, iw, ih);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#1b1712';
  ctx.lineWidth = 10;
  ctx.strokeRect(inset - 5, inset - 5, iw + 10, ih + 10);

  grain(ctx, w, h, 22, rng);
  return toTexture(canvas, 1, 1);
}

export function plateTexture(text: string, seed = 101): THREE.CanvasTexture {
  const w = 192;
  const h = 128;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(seed);
  ctx.fillStyle = '#8a8377';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#a49c8c';
  ctx.fillRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = '#241f19';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  ctx.strokeStyle = 'rgba(30,26,20,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  grain(ctx, w, h, 16, rng);
  return toTexture(canvas, 1, 1);
}

export function paperTexture(title: string, body: string, seed = 103): THREE.CanvasTexture {
  const w = 320;
  const h = 420;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(seed);
  ctx.fillStyle = '#e8e1cd';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    blob(ctx, rng.range(0, w), rng.range(0, h), rng.range(20, 60), 'rgba(160,140,100,0.20)', rng);
  }
  ctx.fillStyle = '#2c281f';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillText(title, w - 22, 44);
  ctx.font = '17px sans-serif';
  const lines = body.split('\n');
  lines.forEach((text, index) => {
    ctx.fillText(text.slice(0, 34), w - 22, 84 + index * 26);
  });
  grain(ctx, w, h, 12, rng);
  return toTexture(canvas, 1, 1);
}

/** Crayon drawings that describe what the player is about to do. */
export function childDrawingTexture(kind: number, seed = 107): THREE.CanvasTexture {
  const w = 256;
  const h = 320;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(seed + kind * 17);

  ctx.fillStyle = '#efe8d4';
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 10, rng);

  const crayon = (color: string, width: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const stick = (x: number, y: number, scale: number, color: string, armsUp = false): void => {
    crayon(color, 4 * scale);
    ctx.beginPath();
    ctx.arc(x, y - 44 * scale, 13 * scale, 0, Math.PI * 2);
    ctx.moveTo(x, y - 31 * scale);
    ctx.lineTo(x, y - 2 * scale);
    ctx.moveTo(x - 16 * scale, armsUp ? y - 32 * scale : y - 14 * scale);
    ctx.lineTo(x, y - 24 * scale);
    ctx.lineTo(x + 16 * scale, armsUp ? y - 32 * scale : y - 14 * scale);
    ctx.moveTo(x, y - 2 * scale);
    ctx.lineTo(x - 12 * scale, y + 24 * scale);
    ctx.moveTo(x, y - 2 * scale);
    ctx.lineTo(x + 12 * scale, y + 24 * scale);
    ctx.stroke();
  };

  const elevator = (x: number, y: number, label: string): void => {
    crayon('#3b5a8c', 5);
    ctx.strokeRect(x - 42, y - 92, 84, 92);
    ctx.beginPath();
    ctx.moveTo(x, y - 92);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = '#8c3b3b';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - 108);
  };

  switch (kind % 6) {
    case 0:
      elevator(w / 2, 200, '0');
      stick(w / 2 - 78, 250, 1, '#7a5a2c');
      break;
    case 1: // two identical figures
      stick(w * 0.32, 230, 1, '#7a5a2c');
      stick(w * 0.68, 230, 1, '#7a5a2c');
      crayon('#8c3b3b', 3);
      ctx.beginPath();
      ctx.moveTo(w * 0.42, 190);
      ctx.lineTo(w * 0.58, 190);
      ctx.stroke();
      break;
    case 2: // a figure looking at itself
      stick(w * 0.34, 235, 1, '#7a5a2c');
      stick(w * 0.66, 235, 1, '#4b4b4b');
      crayon('#3b5a8c', 4);
      ctx.strokeRect(w * 0.52, 130, 76, 150);
      break;
    case 3: // the lift with a negative number
      elevator(w / 2, 210, '−1');
      break;
    case 4: // a door where there is no door
      crayon('#7a5a2c', 6);
      ctx.strokeRect(w * 0.3, 120, 80, 160);
      crayon('#8c3b3b', 4);
      ctx.beginPath();
      ctx.arc(w * 0.38, 205, 5, 0, Math.PI * 2);
      ctx.stroke();
      crayon('#4b4b4b', 3);
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(w * 0.62, 130 + i * 34);
        ctx.lineTo(w * 0.86, 130 + i * 34);
        ctx.stroke();
      }
      break;
    default: // a corridor that folds
      crayon('#3b5a8c', 4);
      ctx.beginPath();
      ctx.moveTo(20, 300);
      ctx.lineTo(110, 150);
      ctx.lineTo(150, 150);
      ctx.lineTo(236, 300);
      ctx.stroke();
      stick(w / 2, 285, 0.75, '#7a5a2c');
      break;
  }

  ctx.strokeStyle = 'rgba(120,100,70,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  return toTexture(canvas, 1, 1);
}

/** Analogue clock face. Hands are drawn thick enough to read in the dark. */
export function clockFaceTexture(hour: number, minute: number, highlight = false): THREE.CanvasTexture {
  const size = 192;
  const { canvas, ctx } = surface(size);
  const center = size / 2;

  ctx.fillStyle = '#efeadb';
  ctx.beginPath();
  ctx.arc(center, center, center - 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = highlight ? '#5f7f4f' : '#2b2721';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(center, center, center - 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#2b2721';
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const inner = i % 3 === 0 ? center - 26 : center - 18;
    ctx.lineWidth = i % 3 === 0 ? 5 : 2.5;
    ctx.beginPath();
    ctx.moveTo(center + Math.sin(angle) * inner, center - Math.cos(angle) * inner);
    ctx.lineTo(center + Math.sin(angle) * (center - 12), center - Math.cos(angle) * (center - 12));
    ctx.stroke();
  }

  const hourAngle = ((hour % 12) / 12 + minute / 720) * Math.PI * 2;
  const minuteAngle = (minute / 60) * Math.PI * 2;

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1d1a15';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center + Math.sin(hourAngle) * 44, center - Math.cos(hourAngle) * 44);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center + Math.sin(minuteAngle) * 66, center - Math.cos(minuteAngle) * 66);
  ctx.stroke();

  ctx.fillStyle = '#1d1a15';
  ctx.beginPath();
  ctx.arc(center, center, 6, 0, Math.PI * 2);
  ctx.fill();

  // Digital readout so the time is never ambiguous.
  ctx.fillStyle = '#4a443a';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    center,
    center + 52,
  );

  return toTexture(canvas, 1, 1);
}

/** The child's drawing of the toy order: numbers and shapes, never colour alone. */
export function toySequenceTexture(sequence: readonly number[]): THREE.CanvasTexture {
  const w = 384;
  const h = 256;
  const { canvas, ctx } = surface(w, h);
  const rng = new RNG(211);

  ctx.fillStyle = '#efe8d4';
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, 10, rng);

  ctx.fillStyle = '#5a4a32';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('הסדר', w / 2, 34);

  const colors = ['#c05a3c', '#3c6ec0', '#4b9a4b', '#c0a03c'];
  const step = w / (sequence.length + 1);
  sequence.forEach((toy, index) => {
    const x = step * (index + 1);
    const y = 130;
    ctx.strokeStyle = colors[toy % 4];
    ctx.fillStyle = colors[toy % 4];
    ctx.lineWidth = 5;
    ctx.beginPath();
    switch (toy % 4) {
      case 0: // circle
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        break;
      case 1: // square
        ctx.rect(x - 22, y - 22, 44, 44);
        break;
      case 2: // triangle
        ctx.moveTo(x, y - 26);
        ctx.lineTo(x + 24, y + 20);
        ctx.lineTo(x - 24, y + 20);
        ctx.closePath();
        break;
      default: // star-ish cross
        ctx.moveTo(x - 24, y - 24);
        ctx.lineTo(x + 24, y + 24);
        ctx.moveTo(x + 24, y - 24);
        ctx.lineTo(x - 24, y + 24);
        break;
    }
    ctx.stroke();

    ctx.fillStyle = '#3a3228';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(String(toy + 1), x, y + 66);
    ctx.font = '16px sans-serif';
    ctx.fillText(String(index + 1), x, y - 46);
  });

  ctx.strokeStyle = 'rgba(120,100,70,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  return toTexture(canvas, 1, 1);
}

/** Soft dark blob used for floor shadows and light spill. */
export function softShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = surface(size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.4)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = toTexture(canvas, 1, 1);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A standing figure, used for reflections and things at the end of the hall. */
export function silhouetteTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const { canvas, ctx } = surface(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6,8,11,0.92)';

  ctx.beginPath();
  ctx.ellipse(w / 2, 52, 26, 32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w / 2 - 40, h);
  ctx.lineTo(w / 2 - 32, 96);
  ctx.quadraticCurveTo(w / 2, 78, w / 2 + 32, 96);
  ctx.lineTo(w / 2 + 40, h);
  ctx.closePath();
  ctx.fill();

  const texture = toTexture(canvas, 1, 1);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A window that shows another corridor instead of the street. */
export function windowCorridorTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(313);
  ctx.fillStyle = '#171c1a';
  ctx.fillRect(0, 0, size, size);

  // One-point perspective corridor.
  const cx = size / 2;
  const cy = size * 0.52;
  ctx.strokeStyle = 'rgba(190,196,170,0.5)';
  ctx.lineWidth = 2;
  for (const [x0, y0] of [
    [0, 0],
    [size, 0],
    [0, size],
    [size, size],
  ] as Array<[number, number]>) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }
  for (let i = 1; i < 7; i++) {
    const scale = 1 / (1 + i * 0.7);
    const w = size * scale;
    const h = size * scale;
    ctx.strokeStyle = `rgba(190,196,170,${0.34 - i * 0.04})`;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  }
  ctx.fillStyle = 'rgba(220,226,200,0.22)';
  ctx.fillRect(cx - 8, cy - 5, 16, 10);

  grain(ctx, size, size, 26, rng);
  return toTexture(canvas, 1, 1);
}

export function rainWindowTexture(seed = 109): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = surface(size);
  const rng = new RNG(seed);
  ctx.fillStyle = 'rgba(20,26,34,1)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(190,205,225,${rng.range(0.05, 0.24)})`;
    ctx.lineWidth = rng.range(0.6, 2);
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng.range(-2, 2), y + rng.range(8, 34));
    ctx.stroke();
  }
  return toTexture(canvas, 1, 1);
}

/**
 * A live CRT surface. The owner calls `update()` and can paint an arbitrary
 * scene into it (security feeds, the "two seconds ahead" trick).
 */
export class ScreenSurface {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private noiseSeed = 0;

  constructor(readonly width = 256, readonly height = 192) {
    const s = surface(width, height);
    this.canvas = s.canvas;
    this.ctx = s.ctx;
    this.texture = toTexture(this.canvas, 1, 1);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  clear(color = '#0b0f0c'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /** Cheap animated static; `density` 0..1. */
  static_(density: number): void {
    const ctx = this.ctx;
    this.noiseSeed = (this.noiseSeed + 1) % 4096;
    const rng = new RNG(this.noiseSeed * 7919);
    const count = Math.floor(density * 1400);
    for (let i = 0; i < count; i++) {
      const v = rng.int(40, 220);
      ctx.fillStyle = `rgba(${v},${v},${v},${rng.range(0.15, 0.55)})`;
      ctx.fillRect(rng.range(0, this.width), rng.range(0, this.height), rng.range(1, 4), rng.range(1, 3));
    }
  }

  scanlines(alpha = 0.16): void {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let y = 0; y < this.height; y += 3) {
      ctx.fillRect(0, y, this.width, 1);
    }
  }

  label(text: string, color = '#8fe6a3'): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 8, 8);
  }

  commit(): void {
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/* ------------------------------------------------------------------ */

export class TextureLibrary {
  private cache = new Map<string, THREE.Texture>();

  get(key: string, create: () => THREE.CanvasTexture): THREE.Texture {
    let texture = this.cache.get(key);
    if (!texture) {
      texture = create();
      this.cache.set(key, texture);
    }
    return texture;
  }

  dispose(): void {
    for (const texture of this.cache.values()) texture.dispose();
    this.cache.clear();
  }
}
