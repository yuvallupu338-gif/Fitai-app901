/*
 * picture.js — pictures, in both directions, at the only resolution this model
 * has: characters.
 *
 * Be clear about which half is the model and which half is not.
 *
 * Reading an image is not the model. A photograph is turned into characters
 * here, by arithmetic — draw it small on a canvas, read the brightness of each
 * cell, pick a character of matching weight. That is a hundred-year-old idea
 * and it is exact; nothing is being recognised, and calling it "scanning" would
 * be a lie about what happened. What it gives you is a picture the model can
 * actually read, because it is text.
 *
 * Drawing one is the model. Two of the corpora are pictures written as text —
 * character art headed by a name in brackets, and small SVG headed by a comment
 * — so a drawing is a completion like any other: write the heading, let it
 * carry on, stop at the blank line or the closing tag. What comes back is
 * whatever an eighty-six thousand weight model can hold about the shape of a
 * cat, which is not much, and the page shows it without dressing it up.
 *
 * The SVG it writes is rendered inside an <img>, which is the one place a
 * browser will draw SVG and refuse to run anything in it: no script, no
 * external loads, no styles reaching out of the image. That is not the only
 * protection here — the markup is filtered below as well — but it is the one
 * that would still hold if the filter were wrong.
 */

/* Ten weights of ink, from empty to solid. Fewer would flatten a photograph;
 * more would ask the model to learn distinctions the corpus cannot teach. */
export const RAMP = ' .:-=+*#%@';

/** A file the user chose, decoded far enough to draw. */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('הקובץ לא נקרא'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('זה לא נראה כמו תמונה'));
      /* A data: URL rather than a blob: one — the page's policy allows data:
       * images and nothing else, and a canvas reading from a data: URL of this
       * origin stays untainted, which is what makes getImageData legal. */
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * An image as characters.
 *
 * The halving of the height is not a guess: a character cell is about twice as
 * tall as it is wide, so sampling the picture on a square grid and printing it
 * in a monospace font stretches everything to twice its height. Ask anyone who
 * has drawn a circle in ASCII and got an egg.
 */
export function imageToCharacters(image, { width = 56, invert = false } = {}) {
  const w = Math.max(8, Math.min(160, Math.round(width)));
  const ratio = image.naturalHeight / Math.max(1, image.naturalWidth);
  const h = Math.max(3, Math.round(w * ratio * 0.5));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const rows = [];
  for (let y = 0; y < h; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = data[i + 3] / 255;
      /* Rec. 601 luma, and transparent pixels count as white paper rather than
       * as black, or every logo with a cut-out background comes back as a
       * silhouette. */
      const luma = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const value = alpha * luma + (1 - alpha);
      const level = invert ? value : 1 - value;
      const at = Math.max(0, Math.min(RAMP.length - 1, Math.round(level * (RAMP.length - 1))));
      line += RAMP[at];
    }
    rows.push(line.replace(/\s+$/, ''));
  }
  return { text: rows.join('\n'), width: w, height: h };
}

/* ------------------------------------------------------------------ *
 * The other direction: pictures the model writes
 * ------------------------------------------------------------------ */

/** Character art, in the shape the corpus keeps it: [name] then the drawing. */
export function drawing(model, name, { generate, temperature = 0.85, topK = 10, maxChars = 320, rng } = {}) {
  const title = String(name || '').replace(/[\[\]\n]/g, '').trim();
  const prompt = `\n[${title}]\n`;
  const raw = generate(model, { prompt, length: maxChars, temperature, topK, rng, stop: ['\n\n', '\n['] });
  let text = raw;
  for (const marker of ['\n\n', '\n[']) {
    const at = text.indexOf(marker);
    if (at >= 0) text = text.slice(0, at);
  }
  return text.replace(/\s+$/, '');
}

/** A vector drawing, headed the way the SVG corpus heads one. */
export function vector(model, name, { generate, temperature = 0.8, topK = 8, maxChars = 400, rng } = {}) {
  const title = String(name || '').replace(/[<>\n]/g, '').trim();
  const prompt = `\n<!-- ${title} -->\n<svg viewBox="0 0 24 24">`;
  const raw = generate(model, { prompt, length: maxChars, temperature, topK, rng, stop: ['</svg>', '\n\n'] });
  return `<svg viewBox="0 0 24 24">${raw.split('\n\n')[0]}`;
}

/* Everything a browser will not need to draw a shape, and a few things it must
 * not be handed. An <img> would already refuse to run the script — this is the
 * belt to that pair of braces, and it also throws away the half-finished
 * attributes a model at this size produces by the dozen. */
const ALLOWED = /^(svg|g|path|circle|ellipse|rect|line|polyline|polygon|title)$/i;

/**
 * The model's output, cut down to something a browser can draw — or null.
 *
 * Written as a filter over tags rather than a parser: DOMParser would hand back
 * a tree that has already been repaired, and the interesting question is
 * whether the model wrote something drawable, not whether the browser can
 * rescue it.
 */
export function safeSvg(text) {
  if (!text || !/^\s*<svg\b/i.test(text)) return null;

  let markup = text;
  const end = markup.toLowerCase().indexOf('</svg>');
  markup = end >= 0 ? markup.slice(0, end + 6) : `${markup}</svg>`;

  /* No script, no styles, no anything that fetches. */
  if (/<\s*(script|foreignObject|image|use|style|animate|set)\b/i.test(markup)) return null;
  if (/\son\w+\s*=/i.test(markup)) return null;
  if (/(href|xlink:href|src|url\s*\()/i.test(markup)) return null;

  /* Every tag it does use has to be one of the shapes. A tag the model invented
   * halfway through a word is how most of these fail. */
  const tags = [...markup.matchAll(/<\s*\/?\s*([a-zA-Z][\w:-]*)/g)].map((m) => m[1]);
  if (!tags.length || !tags.every((t) => ALLOWED.test(t))) return null;

  /* A lone <svg></svg> is valid and draws nothing, which on screen is
   * indistinguishable from a bug in this page. */
  if (!/<\s*(path|circle|ellipse|rect|line|polyline|polygon)\b/i.test(markup)) return null;

  return markup;
}

/** Ready for an <img src>. */
export function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
