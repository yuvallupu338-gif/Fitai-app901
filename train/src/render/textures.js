/*
 * textures.js — every surface in the game, drawn with canvas 2D at boot.
 *
 * Nothing here is downloaded. That is partly the repository's habit (no
 * dependencies, no assets, opens off a disk) and partly a design requirement:
 * the ads, the route map and the station display all have to be *rewritten*
 * mid-run, because an advertisement whose text quietly changes between two
 * stations is one of the few horror beats that works better the less it is
 * pointed at. A texture you can redraw is a texture you can lie with.
 */

import { createTexture, updateTexture, createSolidTexture } from './gl.js';
import { Rng } from '../core/rng.js';

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  return { canvas, ctx };
}

const SANS = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif';
const MONO = '"SF Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace';
const CONDENSED = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';

/* ---- helpers -------------------------------------------------------- */

function fill(ctx, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

/* Per-pixel noise. Slow enough that it is only ever called at load. */
function grain(ctx, w, h, amount, rng, tint = [1, 1, 1]) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    d[i] = clamp255(d[i] + n * tint[0]);
    d[i + 1] = clamp255(d[i + 1] + n * tint[1]);
    d[i + 2] = clamp255(d[i + 2] + n * tint[2]);
  }
  ctx.putImageData(img, 0, 0);
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/* Value-noise blotches, drawn as soft radial gradients. Dirt, soot, damp
   patches, and the smudges on the glass are all this function. */
function blotches(ctx, w, h, count, rng, { color = 'rgba(0,0,0,0.10)', min = 20, max = 120 } = {}) {
  for (let i = 0; i < count; i++) {
    const x = rng.float(0, w);
    const y = rng.float(0, h);
    const r = rng.float(min, max);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function scratches(ctx, w, h, count, rng, color = 'rgba(255,255,255,0.05)') {
  ctx.strokeStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.lineWidth = rng.float(0.4, 1.6);
    ctx.beginPath();
    const x = rng.float(0, w);
    const y = rng.float(0, h);
    const len = rng.float(10, 90);
    const a = rng.float(0, Math.PI * 2);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ---- surfaces ------------------------------------------------------- */

export function floorTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#2b2f34');
  /* Studded rubber floor: the raised discs read as specular dots under the
     ceiling tubes and are the single most "transit" thing in the carriage. */
  const pitch = 32;
  for (let y = pitch / 2; y < S; y += pitch) {
    for (let x = pitch / 2; x < S; x += pitch) {
      const r = 10;
      const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, r);
      g.addColorStop(0, '#3f454c');
      g.addColorStop(0.65, '#33383e');
      g.addColorStop(1, '#24282c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  blotches(ctx, S, S, 26, rng, { color: 'rgba(0,0,0,0.16)', min: 30, max: 150 });
  blotches(ctx, S, S, 8, rng, { color: 'rgba(120,110,90,0.06)', min: 40, max: 120 });
  scratches(ctx, S, S, 60, rng, 'rgba(255,255,255,0.025)');
  grain(ctx, S, S, 16, rng);
  return canvas;
}

export function wallTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  /* Mid grey, not the near-white it wants to be. Under this much fluorescent
     light a 0.73-albedo panel comes back as a flat sheet with no information
     on it at all, and a carriage whose walls carry no information is a
     corridor made of fog. */
  fill(ctx, S, S, '#7f878e');
  for (let x = 0; x < S; x += 2) {
    ctx.fillStyle = `rgba(255,255,255,${rng.float(0, 0.05)})`;
    ctx.fillRect(x, 0, 1, S);
  }
  /* Panel seams: two verticals and a horizontal rail line, with a highlight
     on one side so they catch the ceiling tubes. */
  for (const x of [0, S / 2]) {
    ctx.fillStyle = 'rgba(46,52,58,0.75)';
    ctx.fillRect(x, 0, 3, S);
    ctx.fillStyle = 'rgba(210,220,228,0.30)';
    ctx.fillRect(x + 3, 0, 2, S);
  }
  ctx.fillStyle = 'rgba(52,58,64,0.55)';
  ctx.fillRect(0, S * 0.62, S, 3);
  ctx.fillStyle = 'rgba(200,210,218,0.22)';
  ctx.fillRect(0, S * 0.62 + 3, S, 2);
  blotches(ctx, S, S, 18, rng, { color: 'rgba(40,45,50,0.14)', min: 40, max: 160 });
  scratches(ctx, S, S, 55, rng, 'rgba(60,66,72,0.14)');
  grain(ctx, S, S, 12, rng);
  return canvas;
}

export function ceilingTexture(rng) {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#959ca1');
  /* Moulded panels with a recessed joint. The ceiling is the largest single
     surface a standing passenger looks at and it is the one most likely to
     read as nothing at all. */
  ctx.fillStyle = 'rgba(60,66,72,0.55)';
  ctx.fillRect(0, 0, S, 4);
  ctx.fillRect(0, 0, 4, S);
  ctx.fillStyle = 'rgba(220,228,234,0.30)';
  ctx.fillRect(0, 4, S, 3);
  ctx.fillRect(4, 0, 3, S);
  ctx.fillStyle = 'rgba(70,76,82,0.22)';
  ctx.fillRect(0, S / 2, S, 2);
  blotches(ctx, S, S, 12, rng, { color: 'rgba(60,60,58,0.10)', min: 30, max: 90 });
  grain(ctx, S, S, 10, rng);
  return canvas;
}

export function metalTexture(rng) {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#8b9196');
  for (let i = 0; i < 700; i++) {
    const y = rng.float(0, S);
    ctx.strokeStyle = `rgba(255,255,255,${rng.float(0, 0.08)})`;
    ctx.lineWidth = rng.float(0.5, 1.5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y + rng.float(-1, 1));
    ctx.stroke();
  }
  blotches(ctx, S, S, 10, rng, { color: 'rgba(40,45,50,0.12)', min: 20, max: 70 });
  grain(ctx, S, S, 12, rng);
  return canvas;
}

export function seatTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#1d3350');
  /* Moquette: the speckled municipal upholstery pattern. Dashes at two
     angles in three colours, which is close enough that nobody looks twice. */
  const colors = ['#2b4d76', '#14243a', '#3d6a4f', '#6b3550'];
  for (let i = 0; i < 2600; i++) {
    ctx.save();
    ctx.translate(rng.float(0, S), rng.float(0, S));
    ctx.rotate(rng.bool() ? 0.6 : -0.6);
    ctx.fillStyle = rng.pick(colors);
    ctx.globalAlpha = rng.float(0.35, 0.9);
    ctx.fillRect(0, 0, rng.float(3, 11), rng.float(1.5, 3));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  blotches(ctx, S, S, 18, rng, { color: 'rgba(0,0,0,0.18)', min: 30, max: 120 });
  grain(ctx, S, S, 14, rng);
  return canvas;
}

export function glassSmudgeTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  fill(ctx, S, S, 'rgba(128,128,128,0)');
  /* Alpha carries the smear, RG carry a normal-ish perturbation the glass
     shader uses to wobble the reflection. */
  blotches(ctx, S, S, 30, rng, { color: 'rgba(190,195,200,0.10)', min: 40, max: 180 });
  for (let i = 0; i < 40; i++) {
    const x = rng.float(0, S);
    ctx.strokeStyle = `rgba(210,215,220,${rng.float(0.02, 0.09)})`;
    ctx.lineWidth = rng.float(1, 6);
    ctx.beginPath();
    ctx.moveTo(x, rng.float(-40, S * 0.4));
    ctx.bezierCurveTo(x + rng.float(-8, 8), S * 0.4, x + rng.float(-14, 14), S * 0.7, x + rng.float(-20, 20), S + 30);
    ctx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${rng.int(120, 160)},${rng.int(120, 160)},170,${rng.float(0.02, 0.06)})`;
    ctx.fillRect(rng.float(0, S), rng.float(0, S), rng.float(1, 3), rng.float(1, 3));
  }
  return canvas;
}

export function concreteTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#3a3b3c');
  blotches(ctx, S, S, 40, rng, { color: 'rgba(20,20,22,0.20)', min: 30, max: 180 });
  blotches(ctx, S, S, 22, rng, { color: 'rgba(90,88,84,0.10)', min: 20, max: 90 });
  for (let i = 0; i < 24; i++) {
    ctx.strokeStyle = `rgba(15,15,16,${rng.float(0.1, 0.3)})`;
    ctx.lineWidth = rng.float(0.6, 2.2);
    ctx.beginPath();
    let x = rng.float(0, S), y = rng.float(0, S);
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += rng.float(-40, 40); y += rng.float(-40, 40);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, S, S, 22, rng);
  return canvas;
}

export function tunnelTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#26262a');
  /* Segment rings, cable trays, soot. */
  for (let y = 0; y < S; y += 64) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y, S, 5);
    ctx.fillStyle = 'rgba(80,80,86,0.10)';
    ctx.fillRect(0, y + 5, S, 2);
  }
  blotches(ctx, S, S, 55, rng, { color: 'rgba(0,0,0,0.35)', min: 30, max: 200 });
  blotches(ctx, S, S, 12, rng, { color: 'rgba(110,100,80,0.06)', min: 30, max: 120 });
  grain(ctx, S, S, 20, rng);
  return canvas;
}

export function platformTileTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#c9cbc6');
  const tile = 64;
  for (let y = 0; y < S; y += tile) {
    for (let x = 0; x < S; x += tile) {
      ctx.fillStyle = `rgba(${rng.int(196, 214)},${rng.int(198, 214)},${rng.int(190, 206)},1)`;
      ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    }
  }
  blotches(ctx, S, S, 30, rng, { color: 'rgba(70,70,66,0.14)', min: 20, max: 120 });
  blotches(ctx, S, S, 10, rng, { color: 'rgba(120,100,60,0.08)', min: 30, max: 100 });
  grain(ctx, S, S, 14, rng);
  return canvas;
}

export function wetAsphaltTexture(rng) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#26282b');
  blotches(ctx, S, S, 44, rng, { color: 'rgba(12,13,15,0.30)', min: 20, max: 150 });
  /* Puddles: brighter, because they mirror the platform lights. */
  for (let i = 0; i < 10; i++) {
    const x = rng.float(0, S), y = rng.float(0, S), r = rng.float(30, 90);
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(120,140,160,0.22)');
    g.addColorStop(1, 'rgba(120,140,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, rng.float(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, S, S, 18, rng);
  return canvas;
}

export function lightPanelTexture() {
  const { canvas, ctx } = makeCanvas(64, 256);
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, '#c9d6e2');
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(1, '#c9d6e2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  ctx.fillStyle = 'rgba(180,196,210,0.5)';
  for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 64, 2);
  return canvas;
}

export function clothTexture(rng) {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#ffffff');
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rng.float(0, 0.10)})`;
    ctx.fillRect(rng.float(0, S), rng.float(0, S), rng.float(1, 3), 1);
  }
  for (let y = 0; y < S; y += 4) {
    ctx.fillStyle = 'rgba(0,0,0,0.035)';
    ctx.fillRect(0, y, S, 1);
  }
  grain(ctx, S, S, 8, rng);
  return canvas;
}

export function skinTexture(rng) {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  fill(ctx, S, S, '#ffffff');
  blotches(ctx, S, S, 16, rng, { color: 'rgba(0,0,0,0.05)', min: 8, max: 30 });
  grain(ctx, S, S, 10, rng);
  return canvas;
}

/*
 * A face, laid out for the sphere builder's UVs: the front of a head points
 * along +Z, which lands at u = 0.25.
 *
 * Deliberately underdrawn. Two dark sockets, a suggestion of a mouth, nothing
 * else. Under a fluorescent tube two metres away that is a tired commuter; the
 * moment it has detail it becomes a cartoon, and the moment it becomes a
 * cartoon it stops being unsettling when it turns to look at you.
 */
export function faceTexture(rng, opts = {}) {
  const W = 512, H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  fill(ctx, W, H, '#ffffff');

  const cx = W * 0.25;
  const eyeY = H * 0.40;
  const eyeDx = W * 0.036;
  const open = opts.eyesOpen ?? 1;
  const stare = opts.stare ?? 0;

  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath();
  ctx.ellipse(cx, eyeY + H * 0.05, W * 0.09, H * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const side of [-1, 1]) {
    const ex = cx + side * eyeDx;
    /* Socket shadow */
    const g = ctx.createRadialGradient(ex, eyeY, 1, ex, eyeY, W * 0.033);
    g.addColorStop(0, `rgba(20,18,20,${0.55 + stare * 0.3})`);
    g.addColorStop(1, 'rgba(20,18,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ex - W * 0.04, eyeY - H * 0.07, W * 0.08, H * 0.14);

    if (open > 0.05) {
      ctx.fillStyle = '#e9e6e2';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, W * 0.017, H * 0.017 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = opts.irisColor || '#2a2622';
      ctx.beginPath();
      ctx.ellipse(ex + (opts.gaze || 0) * W * 0.008, eyeY, W * 0.0085, H * 0.014 * open, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(ex + (opts.gaze || 0) * W * 0.008, eyeY, W * 0.004, H * 0.007 * open, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    /* Brow */
    ctx.strokeStyle = `rgba(40,32,28,${0.35 + stare * 0.25})`;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(ex - W * 0.022, eyeY - H * 0.055 + stare * 4);
    ctx.lineTo(ex + W * 0.022, eyeY - H * 0.048);
    ctx.stroke();
  }

  /* Nose shadow and mouth */
  ctx.strokeStyle = 'rgba(60,45,40,0.20)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, eyeY + H * 0.02);
  ctx.lineTo(cx - W * 0.006, eyeY + H * 0.10);
  ctx.stroke();

  ctx.strokeStyle = `rgba(70,45,45,${opts.mouthOpen ? 0.5 : 0.28})`;
  ctx.lineWidth = opts.mouthOpen ? 7 : 3.5;
  ctx.beginPath();
  const mouthY = eyeY + H * 0.17;
  ctx.moveTo(cx - W * 0.026, mouthY);
  ctx.quadraticCurveTo(cx, mouthY + (opts.smile || 0) * 8, cx + W * 0.026, mouthY);
  ctx.stroke();

  if (rng) {
    blotches(ctx, W, H, 10, rng, { color: 'rgba(0,0,0,0.04)', min: 10, max: 40 });
    grain(ctx, W, H, 8, rng);
  }
  return canvas;
}

/* ---- signage, ads and screens --------------------------------------- */

export const AD_TEMPLATES = [
  {
    id: 'insomnia',
    bg: '#12181f', accent: '#e8552f',
    headline: 'STILL AWAKE?',
    body: 'Sleep clinic — appointments after midnight.',
    foot: 'NIGHTHOLM MEDICAL · LINE 4',
  },
  {
    id: 'storage',
    bg: '#f2efe6', accent: '#1a1a1a', dark: true,
    headline: 'ROOM FOR EVERYTHING',
    body: 'Self-storage from 19 a month. First month free.',
    foot: 'KESTREL STORAGE',
  },
  {
    id: 'missing',
    bg: '#ffffff', accent: '#b3121b', dark: true,
    headline: 'HAVE YOU SEEN',
    body: 'Last seen boarding the 00:47 service. Please call.',
    foot: 'TRANSIT POLICE · 8800',
    photo: true,
  },
  {
    id: 'coffee',
    bg: '#2a1c14', accent: '#d9a441',
    headline: 'ONE MORE',
    body: 'Open until the last train. And after.',
    foot: 'BLACKBIRD COFFEE',
  },
  {
    id: 'insurance',
    bg: '#0f2c3f', accent: '#7fd1e8',
    headline: 'WHAT IF TONIGHT',
    body: 'Life cover in four minutes. No medical questions.',
    foot: 'MERIDIAN ASSURANCE',
  },
  {
    id: 'language',
    bg: '#1d1430', accent: '#c6a6ff',
    headline: 'LEARN TO SAY IT',
    body: 'Twelve languages. Ten minutes a day.',
    foot: 'VERBA',
  },
];

export function adTexture(spec, rng) {
  const W = 512, H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  fill(ctx, W, H, spec.bg || '#101418');

  const ink = spec.dark ? '#14161a' : '#f2f4f6';
  const accent = spec.accent || '#e8552f';

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 10, H);

  if (spec.photo) {
    /* A photograph reduced to a silhouette. It should never resolve. */
    ctx.fillStyle = '#d8d8d6';
    ctx.fillRect(W - 150, 30, 120, 150);
    const g = ctx.createLinearGradient(0, 30, 0, 180);
    g.addColorStop(0, '#8f9296');
    g.addColorStop(1, '#4c4f54');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(W - 90, 92, 30, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W - 138, 180);
    ctx.quadraticCurveTo(W - 90, 118, W - 42, 180);
    ctx.fill();
  }

  const rightEdge = spec.photo ? W - 170 : W - 34;
  ctx.fillStyle = ink;
  ctx.font = `700 ${spec.headlineSize || 44}px ${CONDENSED}`;
  ctx.textBaseline = 'top';
  const headLines = wrapText(ctx, spec.headline, rightEdge - 34);
  let y = 34;
  for (const line of headLines) {
    ctx.fillText(line, 34, y);
    y += (spec.headlineSize || 44) * 1.02;
  }

  ctx.fillStyle = spec.dark ? 'rgba(20,22,26,0.78)' : 'rgba(240,244,248,0.78)';
  ctx.font = `400 22px ${SANS}`;
  y += 12;
  for (const line of wrapText(ctx, spec.body, rightEdge - 34)) {
    ctx.fillText(line, 34, y);
    y += 28;
  }

  ctx.fillStyle = accent;
  ctx.font = `700 17px ${SANS}`;
  ctx.fillText(String(spec.foot || '').toUpperCase(), 34, H - 42);

  if (spec.overprint) {
    ctx.save();
    ctx.translate(W * 0.5, H * 0.55);
    ctx.rotate(-0.14);
    ctx.font = `700 46px ${CONDENSED}`;
    ctx.fillStyle = 'rgba(160,20,20,0.72)';
    ctx.textAlign = 'center';
    ctx.fillText(spec.overprint, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  /* Paper behind glass: reflections and age. */
  const shine = ctx.createLinearGradient(0, 0, W, H);
  shine.addColorStop(0, 'rgba(255,255,255,0.06)');
  shine.addColorStop(0.4, 'rgba(255,255,255,0.0)');
  shine.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, W, H);
  if (rng) {
    blotches(ctx, W, H, 8, rng, { color: 'rgba(0,0,0,0.10)', min: 20, max: 90 });
    grain(ctx, W, H, 10, rng);
  }
  return canvas;
}

/*
 * The route map above the doors. Rebuilt whenever the line changes — and the
 * line does change. `highlight` is the station the train is heading for;
 * `ghost` renders an entry in the faded ink used for stations that are on the
 * map tonight and were not on it an hour ago.
 */
export function routeMapTexture(stations, opts = {}) {
  const W = 1024, H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  fill(ctx, W, H, '#f4f1e9');

  ctx.fillStyle = '#12161c';
  ctx.font = `700 26px ${CONDENSED}`;
  ctx.textBaseline = 'top';
  ctx.fillText(opts.title || 'LINE 4 — NORTHBOUND', 34, 22);
  ctx.font = `400 16px ${SANS}`;
  ctx.fillStyle = 'rgba(20,24,30,0.55)';
  ctx.fillText(opts.subtitle || 'LAST SERVICE 00:47', 34, 56);

  const y = 150;
  const left = 60;
  const right = W - 60;
  const step = stations.length > 1 ? (right - left) / (stations.length - 1) : 0;

  ctx.strokeStyle = opts.lineColor || '#1f6bb5';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  stations.forEach((st, i) => {
    const x = left + step * i;
    const ghost = st.ghost;
    ctx.beginPath();
    ctx.arc(x, y, ghost ? 9 : 11, 0, Math.PI * 2);
    ctx.fillStyle = ghost ? '#d9d4c8' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = ghost ? 'rgba(60,64,70,0.35)' : (opts.lineColor || '#1f6bb5');
    ctx.stroke();

    if (opts.highlight === st.id) {
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.strokeStyle = '#c8402c';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(x, y - 24);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'left';
    ctx.font = `${ghost ? '400' : '700'} 20px ${CONDENSED}`;
    ctx.fillStyle = ghost ? 'rgba(40,44,50,0.38)' : '#12161c';
    ctx.fillText(String(st.name).toUpperCase(), 0, 0);
    ctx.restore();
  });
  ctx.textAlign = 'left';

  if (opts.scrawl) {
    ctx.save();
    ctx.translate(opts.scrawl.x ?? W * 0.62, opts.scrawl.y ?? H * 0.78);
    ctx.rotate(opts.scrawl.rotate ?? -0.05);
    ctx.font = `400 ${opts.scrawl.size || 26}px ${CONDENSED}`;
    ctx.fillStyle = opts.scrawl.color || 'rgba(24,32,90,0.72)';
    ctx.fillText(opts.scrawl.text, 0, 0);
    ctx.restore();
  }

  /* Perspex cover: a hard specular streak and the scuffs of ten thousand
     shoulders. */
  const shine = ctx.createLinearGradient(0, 0, W * 0.6, H);
  shine.addColorStop(0, 'rgba(255,255,255,0.16)');
  shine.addColorStop(0.35, 'rgba(255,255,255,0.02)');
  shine.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, W, H);

  if (opts.rng) {
    blotches(ctx, W, H, 10, opts.rng, { color: 'rgba(0,0,0,0.06)', min: 20, max: 80 });
    grain(ctx, W, H, 8, opts.rng);
  }
  return canvas;
}

/*
 * The dot-matrix strip over the doors. Amber LEDs on black, with the grid
 * drawn back over the top so the letters are made of dots rather than merely
 * looking like they might be.
 */
export function displayTexture(lines, opts = {}) {
  const W = 1024, H = 128;
  const { canvas, ctx } = makeCanvas(W, H);
  fill(ctx, W, H, '#050506');

  const color = opts.color || '#ffb03a';
  const rows = Array.isArray(lines) ? lines : [lines];
  ctx.textBaseline = 'middle';
  ctx.textAlign = opts.align === 'left' ? 'left' : 'center';
  const x = opts.align === 'left' ? 24 : W / 2;

  if (rows.length === 1) {
    ctx.font = `700 ${opts.size || 62}px ${MONO}`;
    ctx.fillStyle = color;
    ctx.fillText(String(rows[0]).toUpperCase(), x, H / 2 + 2);
  } else {
    ctx.font = `700 ${opts.size || 40}px ${MONO}`;
    ctx.fillStyle = color;
    rows.slice(0, 2).forEach((line, i) => {
      ctx.fillText(String(line).toUpperCase(), x, H * (i === 0 ? 0.30 : 0.72));
    });
  }

  /* Dot grid mask */
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const pitch = 4;
  for (let yy = 0; yy < H; yy += pitch) ctx.fillRect(0, yy + pitch - 1.4, W, 1.4);
  for (let xx = 0; xx < W; xx += pitch) ctx.fillRect(xx + pitch - 1.4, 0, 1.4, H);
  ctx.globalCompositeOperation = 'source-over';

  /* Glow bleed */
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(6px)';
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';

  if (opts.corrupt) {
    ctx.fillStyle = '#050506';
    for (let i = 0; i < 18; i++) {
      const yy = Math.random() * H;
      ctx.fillRect(0, yy, W, Math.random() * 4);
    }
  }
  return canvas;
}

/* The big enamel station name on the platform wall. */
export function stationSignTexture(name, opts = {}) {
  const W = 1024, H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  fill(ctx, W, H, opts.bg || '#f3f2ee');
  ctx.fillStyle = opts.bar || '#0f3d73';
  ctx.fillRect(0, 0, W, 30);
  ctx.fillRect(0, H - 30, W, 30);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.ink || '#14181d';
  const text = String(name).toUpperCase();
  let size = 118;
  ctx.font = `700 ${size}px ${CONDENSED}`;
  while (ctx.measureText(text).width > W - 90 && size > 30) {
    size -= 4;
    ctx.font = `700 ${size}px ${CONDENSED}`;
  }
  ctx.fillText(text, W / 2, H / 2 + 4);

  if (opts.sub) {
    ctx.font = `400 26px ${SANS}`;
    ctx.fillStyle = 'rgba(20,24,30,0.55)';
    ctx.fillText(opts.sub, W / 2, H - 58);
  }
  ctx.textAlign = 'left';

  if (opts.decay) {
    const rng = opts.rng || new Rng(7);
    blotches(ctx, W, H, Math.round(30 * opts.decay), rng, { color: 'rgba(30,26,20,0.30)', min: 20, max: 120 });
    scratches(ctx, W, H, Math.round(60 * opts.decay), rng, 'rgba(20,18,16,0.20)');
    grain(ctx, W, H, 18 * opts.decay, rng);
  }
  return canvas;
}

/* Small enamel/vinyl notices: emergency instructions, no-smoking, the little
   sticker by the door that nobody has ever read. */
export function noticeTexture(spec, rng) {
  const W = 256, H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  fill(ctx, W, H, spec.bg || '#f0efe9');
  ctx.strokeStyle = spec.border || '#b8271f';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  ctx.textAlign = 'center';
  ctx.fillStyle = spec.border || '#b8271f';
  ctx.font = `700 30px ${CONDENSED}`;
  ctx.textBaseline = 'top';
  ctx.fillText(String(spec.title || '').toUpperCase(), W / 2, 28);

  ctx.fillStyle = '#1b1e22';
  ctx.font = `400 19px ${SANS}`;
  let y = 84;
  for (const line of wrapText(ctx, spec.body || '', W - 52)) {
    ctx.fillText(line, W / 2, y);
    y += 24;
  }
  if (spec.foot) {
    ctx.font = `700 15px ${SANS}`;
    ctx.fillStyle = 'rgba(20,24,30,0.6)';
    ctx.fillText(spec.foot, W / 2, H - 40);
  }
  ctx.textAlign = 'left';
  if (rng) grain(ctx, W, H, 10, rng);
  return canvas;
}

export function newspaperTexture(rng, opts = {}) {
  const W = 512, H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  fill(ctx, W, H, '#ddd8c9');
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `700 44px ${CONDENSED}`;
  ctx.fillText(opts.masthead || 'THE EVENING LINE', 24, 56);
  ctx.fillRect(24, 72, W - 48, 3);

  ctx.font = `700 27px ${CONDENSED}`;
  const head = wrapText(ctx, opts.headline || 'SERVICE RESTORED AFTER OVERNIGHT WORKS', W - 48);
  let y = 96;
  for (const line of head) { ctx.fillText(line, 24, y); y += 30; }

  /* Body copy as ruled grey lines — legible as "text" and never as words. */
  y += 12;
  ctx.fillStyle = 'rgba(30,30,30,0.55)';
  for (let col = 0; col < 2; col++) {
    const cx = 24 + col * (W / 2 - 12);
    let yy = y;
    while (yy < H - 40) {
      const w = (W / 2 - 40) * rng.float(0.72, 1);
      ctx.fillRect(cx, yy, w, 3.2);
      yy += 11;
      if (rng.bool(0.06)) yy += 10;
    }
  }
  if (opts.photo) {
    ctx.fillStyle = '#9a978d';
    ctx.fillRect(W / 2 + 12, y + 20, W / 2 - 36, 120);
  }
  blotches(ctx, W, H, 14, rng, { color: 'rgba(90,70,40,0.10)', min: 20, max: 90 });
  grain(ctx, W, H, 12, rng);
  return canvas;
}

export function graffitiTexture(rng, text) {
  const W = 512, H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(rng.float(-0.12, 0.12));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 96px ${CONDENSED}`;
  ctx.fillStyle = 'rgba(20,20,24,0.55)';
  ctx.fillText(text, 4, 6);
  ctx.fillStyle = 'rgba(196,58,42,0.78)';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';
  return canvas;
}

/* ---- the set the renderer actually holds ---------------------------- */

export class TextureSet {
  constructor(gl, seed = 1337) {
    this.gl = gl;
    this.rng = new Rng(seed);
    this.cache = new Map();
    this.canvases = new Map();

    this.white = createSolidTexture(gl, 255, 255, 255, 255);
    this.black = createSolidTexture(gl, 0, 0, 0, 255);

    const r = (name) => this.rng.stream(name);
    this._add('floor', floorTexture(r('floor')));
    this._add('wall', wallTexture(r('wall')));
    this._add('ceiling', ceilingTexture(r('ceiling')));
    this._add('metal', metalTexture(r('metal')));
    this._add('seat', seatTexture(r('seat')));
    this._add('smudge', glassSmudgeTexture(r('smudge')));
    this._add('concrete', concreteTexture(r('concrete')));
    this._add('tunnel', tunnelTexture(r('tunnel')));
    this._add('tile', platformTileTexture(r('tile')));
    this._add('asphalt', wetAsphaltTexture(r('asphalt')));
    this._add('lightPanel', lightPanelTexture());
    this._add('cloth', clothTexture(r('cloth')));
    this._add('skin', skinTexture(r('skin')));
    this._add('face', faceTexture(r('face')), { clamp: true });
    this._add('faceStare', faceTexture(r('faceStare'), { stare: 1, gaze: 0 }), { clamp: true });
    this._add('faceClosed', faceTexture(r('faceClosed'), { eyesOpen: 0.06 }), { clamp: true });
    this._add('newspaper', newspaperTexture(r('news')), { clamp: true });
  }

  _add(name, canvas, opts = {}) {
    this.canvases.set(name, canvas);
    this.cache.set(name, createTexture(this.gl, canvas, opts));
    return this.cache.get(name);
  }

  get(name) { return this.cache.get(name) || this.white; }
  canvas(name) { return this.canvases.get(name); }
  has(name) { return this.cache.has(name); }

  /* Creates the texture on first use, replaces its pixels on every use after
     — the identity stays stable so materials never have to be rebound. */
  set(name, canvas, opts = {}) {
    if (this.cache.has(name)) {
      this.canvases.set(name, canvas);
      updateTexture(this.gl, this.cache.get(name), canvas);
      return this.cache.get(name);
    }
    return this._add(name, canvas, opts);
  }

  dispose() {
    for (const tex of this.cache.values()) this.gl.deleteTexture(tex);
    this.gl.deleteTexture(this.white);
    this.gl.deleteTexture(this.black);
    this.cache.clear();
  }
}
