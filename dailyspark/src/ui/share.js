/*
 * share.js — renders a spark as an image.
 *
 * This is the app's only growth mechanic, and the design brief for it is the
 * opposite of the usual one: the card is a nice object first and an
 * advertisement a distant second. The wordmark sits small and grey in the
 * corner. A card that shouts is a card nobody posts, and an unposted card
 * markets nothing.
 *
 * Drawn on a canvas rather than composed in the DOM and screenshotted, because
 * html2canvas-style approaches need a library, cannot see the app's web fonts
 * reliably, and produce something subtly different from what was on screen.
 */

import { h, sheet, toast, haptic } from '../core/dom.js';
import { categoryLabel } from '../data/taxonomy.js';

const W = 1080;
const H = 1350;

/* The product palette, hard-coded rather than read from CSS variables: the card
 * is an artifact that leaves the app, and it should look the same whether it
 * was made in light mode, dark mode or high contrast. */
const PAPER = '#FBF7F2';
const INK = '#1A1613';
const MUTED = '#6B6259';
const EMBER = '#C24A18';
const LINE = '#E8DFD4';

/*
 * Word wrap for canvas, which has no such thing.
 *
 * Hebrew wraps on spaces like any other script here; the RTL part is handled by
 * the direction setting on the context plus right-aligned drawing, not by
 * reversing anything by hand. Reversing strings is the classic way to produce
 * text that looks right to someone who cannot read it.
 */
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fontStack(size, weight) {
  return `${weight || 400} ${size}px "Assistant", "Heebo", -apple-system, "Segoe UI", sans-serif`;
}

export function renderCard(entry, spark) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  /* A soft ember glow behind the text, the same gesture the reveal animation
   * makes on screen. It is the one decorative element; everything else is type. */
  const glow = ctx.createRadialGradient(W / 2, H * 0.32, 0, W / 2, H * 0.32, W * 0.75);
  glow.addColorStop(0, 'rgba(232, 98, 44, 0.10)');
  glow.addColorStop(1, 'rgba(232, 98, 44, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const right = W - 96;
  const maxWidth = W - 192;
  let y = 250;

  ctx.fillStyle = EMBER;
  ctx.font = fontStack(30, 600);
  const meta = spark
    ? `${categoryLabel(spark.category)} · ${Math.round((spark.seconds || 60) / 60) || 1} דקות`
    : 'ניצוץ';
  ctx.fillText(meta, right, y);
  y += 78;

  ctx.fillStyle = INK;
  ctx.font = fontStack(78, 700);
  for (const line of wrap(ctx, entry.title, maxWidth)) {
    ctx.fillText(line, right, y);
    y += 94;
  }

  y += 22;
  ctx.fillStyle = MUTED;
  ctx.font = fontStack(40, 400);
  for (const line of wrap(ctx, entry.body, maxWidth)) {
    ctx.fillText(line, right, y);
    y += 58;
  }

  y += 40;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(right, y);
  ctx.lineTo(96, y);
  ctx.stroke();
  y += 70;

  ctx.fillStyle = INK;
  ctx.font = fontStack(46, 700);
  for (const line of wrap(ctx, entry.action, maxWidth)) {
    ctx.fillText(line, right, y);
    y += 62;
  }

  ctx.fillStyle = '#A79C90';
  ctx.font = fontStack(28, 600);
  ctx.textAlign = 'left';
  ctx.fillText('DailySpark', 96, H - 84);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/*
 * Offer the card.
 *
 * Web Share with files where it exists (a phone, which is where this gets
 * used), a download everywhere else. The preview is shown either way: people
 * want to see what they are about to post, and a silent download of an unseen
 * image is a strange thing to do to somebody.
 */
export async function shareEntry(entry, spark) {
  const canvas = renderCard(entry, spark);
  const blob = await canvasToBlob(canvas);
  if (!blob) { toast('לא הצלחנו ליצור את הכרטיס'); return; }

  const url = URL.createObjectURL(blob);
  const img = h('img.share-preview', { src: url, alt: `כרטיס שיתוף: ${entry.title}` });

  const file = new File([blob], 'dailyspark.png', { type: 'image/png' });
  const canShareFile = navigator.canShare && navigator.canShare({ files: [file] });

  const close = sheet(h('div.share-body', img, h('div.sheet-actions',
    canShareFile ? h('button.btn.btn-primary', {
      onclick: async () => {
        haptic('light');
        try {
          await navigator.share({ files: [file], title: entry.title });
          close();
        } catch (e) { /* the person cancelled the share sheet */ }
      },
    }, 'שתף') : null,
    h('button.btn', {
      onclick: () => {
        const a = h('a', { href: url, download: `dailyspark-${entry.title}.png` });
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('הכרטיס נשמר');
      },
    }, 'שמור תמונה'),
    h('button.btn.btn-ghost', { onclick: () => close() }, 'סגור'))), {
    label: 'שיתוף ניצוץ',
    title: 'כרטיס לשיתוף',
    onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
  });
}
